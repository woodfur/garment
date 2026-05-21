import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { compositeNextGarment, generateVideoFromImage, type ZoneItem } from "@/lib/replicate";
import { ZONE_LAYER_ORDER } from "@/types/zones";
import type { Gender } from "@/types/database";

// POST /api/webhooks/replicate
// Receives Replicate prediction completion callbacks
export async function POST(req: Request) {
  // Verify webhook signature
  const secret = process.env.REPLICATE_WEBHOOK_SECRET;
  if (secret) {
    const signature = req.headers.get("webhook-secret");
    if (signature !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Parse metadata from query params (passed when prediction was created)
  const url = new URL(req.url);
  const combinationId  = url.searchParams.get("combination_id");
  const gender         = url.searchParams.get("gender") as Gender | null;
  const sequenceIndex  = parseInt(url.searchParams.get("sequence_index") ?? "0", 10);
  const totalSteps     = parseInt(url.searchParams.get("total_steps") ?? "1", 10);
  const jobType        = url.searchParams.get("job_type") ?? "";

  if (!combinationId || !gender) {
    return NextResponse.json({ error: "Missing metadata" }, { status: 400 });
  }

  const body = await req.json() as {
    id: string;
    status: string;
    output?: string | string[];
    error?: string;
  };

  const admin = createAdminClient();
  // Cast to any for tables not yet in generated types (replicate_jobs, combination_zone_items)
  const db = admin as any;

  // Handle failure
  if (body.status === "failed" || body.status === "canceled") {
    await db.from("replicate_jobs").update({ status: "failed" }).eq("prediction_id", body.id);
    // Check if all jobs for this combination are done/failed
    const { data: jobs } = await db.from("replicate_jobs").select("status").eq("combination_id", combinationId);
    const allSettled = (jobs as Array<{ status: string }> | null)?.every((j) => j.status === "done" || j.status === "failed");
    if (allSettled) {
      await db.from("combinations").update({ preview_status: "failed" }).eq("id", combinationId);
    }
    return NextResponse.json({ received: true });
  }

  if (body.status !== "succeeded") {
    return NextResponse.json({ received: true });
  }

  const outputUrl = Array.isArray(body.output) ? body.output[0] : String(body.output ?? "");
  if (!outputUrl) return NextResponse.json({ error: "No output URL" }, { status: 400 });

  // Mark current job done
  await db.from("replicate_jobs")
    .update({ status: "done", current_image_url: outputUrl })
    .eq("prediction_id", body.id);

  // --- Composite step completed ---
  if (jobType.startsWith("composite_")) {
    const nextIndex = sequenceIndex + 1;

    if (nextIndex < totalSteps) {
      // Continue chain — fetch next zone item
      const { data: zoneItems } = await db
        .from("combination_zone_items")
        .select("*, uniform:uniforms(id, name, image_url)")
        .eq("combination_id", combinationId)
        .eq("gender", gender);

      const typedItems = (zoneItems ?? []) as Array<{
        zone: string;
        uniform_id: string;
        uniform: { id: string; name: string; image_url: string | null } | null;
      }>;

      const orderedItems: ZoneItem[] = ZONE_LAYER_ORDER
        .filter((zone) => typedItems.some((i) => i.zone === zone && i.uniform?.image_url))
        .map((zone) => {
          const item = typedItems.find((i) => i.zone === zone)!;
          return {
            zone: item.zone as ZoneItem["zone"],
            uniform_id: item.uniform_id,
            uniform_image_url: item.uniform!.image_url!,
            uniform_name: item.uniform!.name,
          };
        });

      if (orderedItems[nextIndex]) {
        await compositeNextGarment(
          outputUrl,
          orderedItems[nextIndex],
          combinationId,
          gender,
          nextIndex,
          totalSteps
        );
      }
    } else {
      // All garments composited — store composite URL and fire animation
      const col = gender === "male" ? "male_composite_url" : "female_composite_url";
      await db.from("combinations").update({ [col]: outputUrl }).eq("id", combinationId);
      await generateVideoFromImage(outputUrl, combinationId, gender);
    }
  }

  // --- Animation (GIF) step completed ---
  if (jobType === `gif_${gender}`) {
    const col = gender === "male" ? "male_gif_url" : "female_gif_url";
    await db.from("combinations").update({ [col]: outputUrl }).eq("id", combinationId);

    // Check if both GIFs ready
    const { data: combo } = await db
      .from("combinations")
      .select("male_gif_url, female_gif_url")
      .eq("id", combinationId)
      .single() as { data: { male_gif_url: string | null; female_gif_url: string | null } | null };

    if (combo?.male_gif_url && combo?.female_gif_url) {
      await db.from("combinations").update({ preview_status: "ready" }).eq("id", combinationId);
    }
  }

  return NextResponse.json({ received: true });
}
