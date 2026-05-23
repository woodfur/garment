import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { startCompositeChain, type ZoneItem } from "@/lib/replicate";
import { ZONE_LAYER_ORDER } from "@/types/zones";
import { MANNEQUIN_MALE_URL, MANNEQUIN_FEMALE_URL } from "@/lib/mannequin-config";
import type { Gender } from "@/types/database";

// POST /api/branch/combinations/[combinationId]/generate-preview
// Body: { gender?: 'male' | 'female' | 'both', force?: boolean }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ combinationId: string }> }
) {
  const authResult = await requireBranchLeader();
  if (authResult instanceof NextResponse) return authResult;
  const { auth } = authResult;

  const { combinationId } = await params;
  const body = await req.json().catch(() => ({})) as { gender?: string; force?: boolean };
  const genderParam = (body.gender ?? "both") as "male" | "female" | "both";
  // GAP-6 FIX: Runtime validate genderParam \u2014 TypeScript 'as' cast does no runtime check.
  // An invalid value would propagate to replicate_jobs.gender and the webhook URL params.
  if (body.gender !== undefined && !["male", "female", "both"].includes(body.gender)) {
    return NextResponse.json({ error: "gender must be 'male', 'female', or 'both'" }, { status: 400 });
  }
  const force = body.force === true;

  const admin = createAdminClient();
  // Cast for new columns not yet in Supabase generated types
  const db = admin as any;

  // Fetch combination
  const { data: combo, error: comboErr } = await db
    .from("combinations")
    .select("*, department:departments(name)")
    .eq("id", combinationId)
    .single();

  if (comboErr || !combo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (combo.branch_id !== auth.branchId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Guard against double-fire
  if (combo.preview_status === "processing") {
    return NextResponse.json({ error: "Already processing. Wait for current generation to complete." }, { status: 429 });
  }
  if (combo.preview_status === "ready" && !force) {
    return NextResponse.json({ error: "Preview already generated. Pass force=true to regenerate." }, { status: 409 });
  }

  // Check mannequin URLs configured
  if (!MANNEQUIN_MALE_URL || !MANNEQUIN_FEMALE_URL) {
    return NextResponse.json({ error: "Mannequin characters not yet configured. Contact administrator." }, { status: 503 });
  }

  // Fetch zone items with uniform data (cast admin for unregistered table)
  const { data: zoneItems, error: zoneErr } = await (admin as any)
    .from("combination_zone_items")
    .select("*, uniform:uniforms(id, name, image_url, bg_removed, category)")
    .eq("combination_id", combinationId);

  if (zoneErr) return NextResponse.json({ error: zoneErr.message }, { status: 500 });

  const typedZoneItems = (zoneItems ?? []) as Array<{
    gender: Gender;
    zone: string;
    uniform_id: string;
    uniform: { id: string; name: string; image_url: string | null; bg_removed: boolean; category: string } | null;
  }>;

  // GAP-1 FIX: When 'both' is requested, only process genders that have zone items.
  // Genders with no assignments are silently skipped — not treated as an error.
  const assignedGenders = new Set(typedZoneItems.map((i) => i.gender));
  const genders: Gender[] = genderParam === "both"
    ? (["male", "female"] as Gender[]).filter((g) => assignedGenders.has(g))
    : [genderParam as Gender];

  if (genders.length === 0) {
    return NextResponse.json({ error: "No zone items assigned for any gender. Assign uniforms to zones before generating a preview." }, { status: 400 });
  }

  // Validate: at least one non-accessory (core) zone per each included gender
  const warnings: string[] = [];
  for (const gender of genders) {
    const genderItems = typedZoneItems.filter((i) => i.gender === gender);
    const coreItems = genderItems.filter((i) => !i.zone.startsWith("accessory_"));
    if (coreItems.length === 0) {
      return NextResponse.json(
        { error: `No core zone items for ${gender} outfit. Assign at least one item (top, bottom, footwear, head, or outer).` },
        { status: 400 }
      );
    }
    // Warn if any uniform lacks bg removal
    const missingBg = genderItems.filter((i) => i.uniform && !i.uniform.bg_removed);
    if (missingBg.length > 0) {
      warnings.push(`${gender}: ${missingBg.map((i) => i.uniform?.name).join(", ")} have not had background removed. Preview quality may be affected.`);
    }
  }

  // Set status to processing (and clear old GIF URLs if force-regenerating)
  if (force) {
    // GAP-9 FIX: Clear stale GIF/composite URLs so checkAndMarkReady() doesn't
    // immediately flip status back to 'ready' using the old values
    await db.from("combinations").update({
      preview_status: "processing",
      male_gif_url: null,
      female_gif_url: null,
      male_composite_url: null,
      female_composite_url: null,
    }).eq("id", combinationId);
  } else {
    await db.from("combinations").update({ preview_status: "processing" }).eq("id", combinationId);
  }

  // Fire composite chains for each gender in parallel
  const chainPromises = genders.map(async (gender) => {
    const genderItems = typedZoneItems.filter((i) => i.gender === gender && i.uniform?.image_url);
    // Sort by ZONE_LAYER_ORDER
    const ordered: ZoneItem[] = ZONE_LAYER_ORDER
      .filter((zone) => genderItems.some((i) => i.zone === zone))
      .map((zone) => {
        const item = genderItems.find((i) => i.zone === zone)!;
        return {
          zone: item.zone as ZoneItem["zone"],
          uniform_id: item.uniform_id,
          uniform_image_url: item.uniform!.image_url!,
          uniform_name: item.uniform!.name,
        };
      });

    const baseUrl = gender === "male" ? MANNEQUIN_MALE_URL : MANNEQUIN_FEMALE_URL;
    const estimatedSeconds = ordered.length * 20 + 45;
    return startCompositeChain(combinationId, gender, ordered, baseUrl).then((r) => ({
      gender, predictionId: r.predictionId, estimatedSeconds,
    }));
  });

  const results = await Promise.allSettled(chainPromises);

  // GAP-3 FIX: If ANY chain failed to start, mark as failed.
  // Previously only failed when ALL chains rejected, which left combinations
  // permanently stuck in "processing" when only one gender's chain was rejected.
  const anyFailed = results.some((r) => r.status === "rejected");
  if (anyFailed) {
    const rejectedReasons = (results.filter((r) => r.status === "rejected") as PromiseRejectedResult[])
      .map((r) => r.reason?.message ?? "Unknown error")
      .join("; ");
    await db.from("combinations").update({ preview_status: "failed" }).eq("id", combinationId);
    console.error(`[generate-preview] Chain failure for ${combinationId}: ${rejectedReasons}`);
    return NextResponse.json({ error: "One or more AI generation chains failed to start. Please try again." }, { status: 500 });
  }

  const maxEstimate = (results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ gender: Gender; predictionId: string; estimatedSeconds: number }>[])
    .reduce((max, r) => Math.max(max, r.value.estimatedSeconds), 0);

  return NextResponse.json({
    status: "processing",
    estimated_seconds: maxEstimate,
    warnings: warnings.length > 0 ? warnings : undefined,
  });
}
