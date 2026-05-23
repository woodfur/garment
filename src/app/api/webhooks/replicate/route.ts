import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { compositeNextGarment, generateVideoFromImage, type ZoneItem } from "@/lib/replicate";
import { ZONE_LAYER_ORDER } from "@/types/zones";
import type { Gender } from "@/types/database";

// ---------------------------------------------------------------------------
// GAP-5 FIX: Proper Replicate HMAC-SHA256 webhook signature verification
// ---------------------------------------------------------------------------
// Replicate sends three headers: webhook-id, webhook-timestamp, webhook-signature
// The signed content is: `${webhook-id}.${webhook-timestamp}.${body}`
// The webhook-signature is: `v1,${base64(HMAC-SHA256(signingKey, content))}`
// Reference: https://docs.replicate.com/reference/webhooks#webhook-signing
async function verifyReplicateWebhook(req: Request, rawBody: string): Promise<boolean> {
  const secret = process.env.REPLICATE_WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      // GAP-3 FIX: In production, reject all webhooks if secret is not configured.
      // This prevents unauthenticated webhook injection when the env var is missing.
      console.error("[webhook] REPLICATE_WEBHOOK_SECRET is not set in production — rejecting request");
      return false;
    }
    // In development, skip verification with a warning
    console.warn("[webhook] REPLICATE_WEBHOOK_SECRET not set — skipping signature verification (dev only)");
    return true;
  }

  const webhookId        = req.headers.get("webhook-id");
  const webhookTimestamp = req.headers.get("webhook-timestamp");
  const webhookSignature = req.headers.get("webhook-signature");

  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    console.error("[webhook] Missing required Replicate webhook headers");
    return false;
  }

  // Reject if timestamp is more than 5 minutes old (replay protection)
  const ts = parseInt(webhookTimestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    console.error("[webhook] Webhook timestamp too old or invalid");
    return false;
  }

  // Build the signed payload string
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody}`;

  // Import the base64-decoded secret as an HMAC key
  const secretBytes = Uint8Array.from(Buffer.from(secret, "base64"));
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  // webhook-signature can contain multiple comma-separated signatures (e.g. "v1,abc123 v1,def456")
  // Accept if ANY of them verifies correctly
  const signatures = webhookSignature.split(" ");
  for (const sig of signatures) {
    const [version, encoded] = sig.split(",");
    if (version !== "v1" || !encoded) continue;

    try {
      const sigBytes = Uint8Array.from(Buffer.from(encoded, "base64"));
      const valid = await crypto.subtle.verify(
        "HMAC",
        key,
        sigBytes,
        new TextEncoder().encode(signedContent)
      );
      if (valid) return true;
    } catch {
      // malformed signature — try next
    }
  }

  return false;
}

// POST /api/webhooks/replicate
// Receives Replicate prediction completion callbacks
export async function POST(req: Request) {
  // Read raw body first (needed for signature verification before JSON parse)
  const rawBody = await req.text();

  // GAP-5 FIX: Verify using HMAC-SHA256 instead of plain-string comparison
  const isValid = await verifyReplicateWebhook(req, rawBody);
  if (!isValid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  // GAP-5 FIX: Validate gender is strictly 'male' or 'female'.
  // Any other value would silently write to the wrong DB column via the ternary at line ~184.
  if (gender !== "male" && gender !== "female") {
    return NextResponse.json({ error: "Invalid gender param — must be 'male' or 'female'" }, { status: 400 });
  }

  let body: { id: string; status: string; output?: string | string[]; error?: string };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createAdminClient();
  // Cast to any for tables not yet in generated types (replicate_jobs, combination_zone_items)
  const db = admin as any;

  // Handle failure
  if (body.status === "failed" || body.status === "canceled") {
    await db.from("replicate_jobs")
      .update({ status: "failed", error_message: body.error ?? `Prediction ${body.status}` })
      .eq("prediction_id", body.id);
    // GAP-10 FIX: Check jobsErr before using jobs — a DB error returns null jobs which
    // makes allSettled undefined (falsy), silently skipping the failed status update.
    const { data: jobs, error: jobsErr } = await db.from("replicate_jobs").select("status").eq("combination_id", combinationId);
    if (!jobsErr && jobs) {
      const allSettled = (jobs as Array<{ status: string }>).every((j) => j.status === "done" || j.status === "failed");
      if (allSettled) {
        await db.from("combinations").update({ preview_status: "failed" }).eq("id", combinationId);
      }
    }
    return NextResponse.json({ received: true });
  }

  if (body.status !== "succeeded") {
    return NextResponse.json({ received: true });
  }

  const outputUrl = Array.isArray(body.output) ? body.output[0] : String(body.output ?? "");
  // GAP-1 FIX: Return 200 (not 400) when output URL is empty.
  // A non-2xx response causes Replicate to retry the webhook indefinitely.
  // We still mark as failed so the combination doesn't hang in 'processing'.
  if (!outputUrl) {
    await db.from("replicate_jobs").update({ status: "failed", error_message: "Prediction succeeded but returned no output URL" }).eq("prediction_id", body.id);
    await db.from("combinations").update({ preview_status: "failed" }).eq("id", combinationId);
    return NextResponse.json({ received: true, warning: "No output URL" });
  }

  // Mark current job done
  await db.from("replicate_jobs")
    .update({ status: "done", current_image_url: outputUrl })
    .eq("prediction_id", body.id);

  // --- Composite step completed ---
  // GAP-2 FIX: Wrap chain continuation in try/catch and return 200 on error.
  // Without this, any thrown error returns 500 to Replicate, which retries the
  // webhook and creates duplicate chain steps and replicate_jobs rows.
  if (jobType.startsWith("composite_")) {
    try {
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
    } catch (chainErr) {
      console.error("[webhook] composite chain error:", chainErr);
      await db.from("combinations").update({ preview_status: "failed" }).eq("id", combinationId);
      // Return 200 to stop Replicate from retrying and creating duplicate jobs
      return NextResponse.json({ received: true, error: "chain step failed" });
    }
  }

  // --- Animation (GIF) step completed ---
  if (jobType === `gif_${gender}`) {
    const col = gender === "male" ? "male_gif_url" : "female_gif_url";
    await db.from("combinations").update({ [col]: outputUrl }).eq("id", combinationId);

    // GAP-11 FIX: Gender-aware readiness check
    // Only require GIFs for genders that have zone items assigned
    const { data: zoneItems } = await db
      .from("combination_zone_items")
      .select("gender")
      .eq("combination_id", combinationId);

    const assignedGenders = new Set<string>(
      (zoneItems ?? []).map((i: { gender: string }) => i.gender)
    );

    const { data: combo } = await db
      .from("combinations")
      .select("male_gif_url, female_gif_url")
      .eq("id", combinationId)
      .single() as { data: { male_gif_url: string | null; female_gif_url: string | null } | null };

    const maleReady   = !assignedGenders.has("male")   || !!combo?.male_gif_url;
    const femaleReady = !assignedGenders.has("female") || !!combo?.female_gif_url;

    if (maleReady && femaleReady) {
      await db.from("combinations").update({ preview_status: "ready" }).eq("id", combinationId);
    }
  }

  return NextResponse.json({ received: true });
}
