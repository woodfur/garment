import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";
import {
  checkAndMarkReady,
  markPreviewFailed,
  renderAndPersistLook,
} from "@/lib/preview-render";
import type { LookColorItem, LookPhotoItem } from "@/lib/look-prompt";
import { baseFigureUrlFor } from "@/lib/mannequin-config";
import { ZONE_LAYER_ORDER } from "@/types/zones";
import type { Gender } from "@/types/database";

// A full-body gpt-image-2 render at high quality runs well past the default budget.
export const maxDuration = 300;

/** Rough wall-clock estimate shown in the UI while the render runs. */
const ESTIMATED_SECONDS = 90;

type CombinationZoneItem = {
  gender: Gender;
  zone: string;
  uniform_id: string;
  uniform: {
    id: string;
    name: string;
    image_url: string | null;
    bg_removed: boolean;
    category: string;
    color: string | null;
    color_label: string | null;
  } | null;
};

type PreviewQuery = {
  select(columns: string): PreviewQuery;
  eq(column: string, value: string): PreviewQuery;
  update(values: Record<string, unknown>): PreviewQuery;
  single(): Promise<{ data: unknown; error: { message: string } | null }>;
};

type PreviewDb = { from(table: string): PreviewQuery };

/** Photo pieces drive layering; colour pieces are described in the prompt instead. */
function orderedPhotoItems(items: CombinationZoneItem[]): LookPhotoItem[] {
  return ZONE_LAYER_ORDER.flatMap((zone) => {
    const item = items.find((candidate) => candidate.zone === zone && candidate.uniform?.image_url);
    if (!item) return [];
    return [{
      zone: item.zone,
      uniformName: item.uniform!.name,
      imageUrl: item.uniform!.image_url!,
    }];
  });
}

function colorItemsFor(items: CombinationZoneItem[]): LookColorItem[] {
  return items
    .filter((item) => item.uniform?.color && !item.uniform?.image_url)
    .map((item) => ({
      zone: item.zone,
      category: item.uniform!.category,
      hex: item.uniform!.color!,
    }));
}

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

  // Runtime validation — a TS cast does no checking, and an invalid value would reach the renderer.
  if (body.gender !== undefined && !["male", "female", "both"].includes(body.gender)) {
    return NextResponse.json({ error: "gender must be 'male', 'female', or 'both'" }, { status: 400 });
  }
  const genderParam = (body.gender ?? "both") as "male" | "female" | "both";
  const force = body.force === true;

  const admin = createAdminClient();
  const db = admin as unknown as PreviewDb;

  const { data: combo } = await db
    .from("combinations")
    .select("id, branch_id, preview_status")
    .eq("id", combinationId)
    .single() as { data: { id: string; branch_id: string; preview_status: string } | null };

  if (!combo || combo.branch_id !== auth.branchId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (combo.preview_status === "processing") {
    return NextResponse.json({ error: "Already processing. Wait for current generation to complete." }, { status: 429 });
  }
  if (combo.preview_status === "ready" && !force) {
    return NextResponse.json({ error: "Preview already generated. Pass force=true to regenerate." }, { status: 409 });
  }

  const { data: zoneItems, error: zoneErr } = await db
    .from("combination_zone_items")
    .select("*, uniform:uniforms(id, name, image_url, bg_removed, category, color, color_label)")
    .eq("combination_id", combinationId) as unknown as {
      data: CombinationZoneItem[] | null;
      error: { message: string } | null;
    };

  if (zoneErr) return NextResponse.json({ error: zoneErr.message }, { status: 500 });
  const typedZoneItems = zoneItems ?? [];

  // Only render genders that actually have assignments; an unassigned gender is skipped, not an error.
  const assignedGenders = new Set(typedZoneItems.map((item) => item.gender));
  const genders: Gender[] = genderParam === "both"
    ? (["male", "female"] as Gender[]).filter((gender) => assignedGenders.has(gender))
    : [genderParam as Gender];

  if (genders.length === 0) {
    return NextResponse.json(
      { error: "No zone items assigned for any gender. Assign uniforms to zones before generating a preview." },
      { status: 400 }
    );
  }

  const warnings: string[] = [];
  for (const gender of genders) {
    const genderItems = typedZoneItems.filter((item) => item.gender === gender);
    const coreItems = genderItems.filter((item) => !item.zone.startsWith("accessory_"));
    if (coreItems.length === 0) {
      return NextResponse.json(
        { error: `No core zone items for ${gender} outfit. Assign at least one item (dress, top, bottom, footwear, head, or outer).` },
        { status: 400 }
      );
    }

    const missingBg = genderItems.filter((item) => item.uniform?.image_url && !item.uniform.bg_removed);
    if (missingBg.length > 0) {
      warnings.push(
        `${gender}: ${missingBg.map((item) => item.uniform?.name).join(", ")} have not had background removed. Preview quality may be affected.`
      );
    }
  }

  // Clear stale composites on a forced regenerate so checkAndMarkReady() cannot flip the
  // status straight back to 'ready' using the previous run's URLs.
  await db.from("combinations").update(
    force
      ? { preview_status: "processing", male_composite_url: null, female_composite_url: null }
      : { preview_status: "processing" }
  ).eq("id", combinationId);

  // One gpt-image-2 call per gender, in the background so the client keeps polling
  // preview-status exactly as before rather than holding a multi-minute request open.
  //
  // The promise starts executing here regardless of platform; waitUntil only stops Vercel
  // freezing the instance before it settles, and is a documented no-op off-platform (so
  // `npm run dev` behaves the same). The catch is required either way — an unhandled
  // rejection would otherwise take down the dev server.
  const render = renderAll(combinationId, genders, typedZoneItems).catch((error) => {
    console.error(`[generate-preview] Background render crashed for ${combinationId}:`, error);
  });
  waitUntil(render);

  return NextResponse.json({
    status: "processing",
    estimated_seconds: ESTIMATED_SECONDS,
    warnings: warnings.length > 0 ? warnings : undefined,
  }, { status: 202 });
}

async function renderAll(
  combinationId: string,
  genders: Gender[],
  zoneItems: CombinationZoneItem[]
): Promise<void> {
  const results = await Promise.allSettled(
    genders.map((gender) => {
      const genderItems = zoneItems.filter((item) => item.gender === gender);
      const zones = new Set(genderItems.map((item) => item.zone));
      const isTwoPiece = zones.has("top") && zones.has("bottom") && !zones.has("full_body");

      return renderAndPersistLook(combinationId, {
        gender,
        colorItems: colorItemsFor(genderItems),
        photoItems: orderedPhotoItems(genderItems),
        baseFigureUrl: baseFigureUrlFor(gender, isTwoPiece),
      });
    })
  );

  const failures = results.filter((result) => result.status === "rejected") as PromiseRejectedResult[];
  if (failures.length > 0) {
    console.error(
      `[generate-preview] Render failed for ${combinationId}:`,
      failures.map((failure) => failure.reason?.message ?? "Unknown error").join("; ")
    );
    // Any failed gender marks the whole combination failed — a half-rendered look is not usable.
    await markPreviewFailed(combinationId);
    return;
  }

  await checkAndMarkReady(combinationId);
}
