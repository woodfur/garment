import { createAdminClient } from "@/lib/supabase/server";
import {
  MAX_REFERENCE_IMAGES,
  editImage,
  generateImage,
  referenceFromUrl,
  type ReferenceImage,
} from "@/lib/openai-image";
import { swatchReference } from "@/lib/palette-swatch";
import { planLook, type LookColorItem, type LookPhotoItem } from "@/lib/look-prompt";
import { buildPalettePrompt, type PaletteColor } from "@/lib/palette-prompt";
import type { Gender } from "@/types/database";

/**
 * Renders a combination preview in a single gpt-image-2 call.
 *
 * This replaces the old Replicate chain, which fired one IDM-VTON prediction per garment
 * and stitched them together through webhooks (prod) or polling (dev). One call is both
 * simpler and better quality: the model composes the whole outfit at once instead of
 * re-encoding the previous step's output for every garment.
 */

type PreviewQuery = {
  select(columns: string): PreviewQuery;
  eq(column: string, value: string): PreviewQuery;
  update(values: Record<string, unknown>): PreviewQuery;
  single(): Promise<{ data: unknown; error: { message: string } | null }>;
};

type PreviewDb = { from(table: string): PreviewQuery };

function previewDb(): PreviewDb {
  return createAdminClient() as unknown as PreviewDb;
}

export type RenderLookInput = {
  gender: Gender;
  colorItems: LookColorItem[];
  /** Already sorted by ZONE_LAYER_ORDER — planLook addresses these by position. */
  photoItems: LookPhotoItem[];
  baseFigureUrl: string | null;
  /** Optional free-text styling direction from the branch leader. */
  notes?: string | null;
};

export async function renderLookImage({
  gender,
  colorItems,
  photoItems,
  baseFigureUrl,
  notes = null,
}: RenderLookInput): Promise<Buffer> {
  const { slots, prompt } = planLook({
    gender,
    colorItems,
    photoItems,
    hasFigureReference: !!baseFigureUrl,
    notes,
  });

  if (slots.length > MAX_REFERENCE_IMAGES) {
    throw new Error(
      `This look needs ${slots.length} reference images but gpt-image-2 accepts at most ${MAX_REFERENCE_IMAGES}. Remove some assigned pieces and try again.`
    );
  }

  const references: ReferenceImage[] = [];
  for (const slot of slots) {
    if (slot.kind === "figure") {
      references.push(await referenceFromUrl(baseFigureUrl!, "base-figure.png"));
    } else if (slot.kind === "chart") {
      references.push(await swatchReference(colorItems.map((item) => ({ hex: item.hex, label: null }))));
    } else {
      references.push(await referenceFromUrl(slot.item.imageUrl, `garment-${slot.item.zone}.png`));
    }
  }

  // A look with neither a base figure nor colour pieces has nothing to edit from.
  if (references.length === 0) return generateImage({ prompt });

  return editImage({ prompt, references });
}

/**
 * Generate a base mannequin figure — the neutral model every look is rendered onto.
 *
 * Run once per gender by an admin; the resulting URLs go into NEXT_PUBLIC_MANNEQUIN_*.
 * The plain grey outfit is deliberate: it gives the model a clean garment silhouette to
 * replace without bleeding colour into the look being rendered.
 */
export async function generateBaseFigureImage(gender: Gender): Promise<Buffer> {
  const prompt = gender === "male"
    ? "Highly realistic, tack-sharp, full-body white studio clothing-catalogue photograph of an adult Black African man church uniform model standing upright and facing directly toward the camera, warm friendly smile, polished grooming, short neat hair, clean-shaven or neatly trimmed beard, wearing a plain light neutral grey modest church-service base outfit, short-sleeve collared shirt, tailored trousers, simple black belt, glossy black closed-toe dress shoes, hands gently clasped together in front of his waist, entire body visible from top of head to bottom of shoes with generous white space, seamless pure white studio background, soft even professional e-commerce lighting, subtle realistic shadow beneath feet, natural skin texture, accurate fabric detail, deep focus, sharp focus on face, hands, shirt, trousers and shoes, realistic proportions, centered symmetrical composition, portrait orientation, no blur, no shallow depth of field, no tight fit, no cropped feet, no text, no logo, no watermark"
    : "Highly realistic, tack-sharp, full-body white studio clothing-catalogue photograph of an adult Black African woman church uniform model standing upright and facing directly toward the camera, warm friendly smile, natural polished makeup, neatly shaped eyebrows, smooth dark hair styled in a sleek side part gathered into a low bun, small pearl stud earrings, wearing a plain light neutral grey modest knee-to-mid-calf A-line uniform dress, short sleeves, tailored lapels or modest square neckline, fitted waist with simple belt, softly flared skirt, covered chest, simple glossy black closed-toe court shoes with a low heel, hands gently clasped together in front of her waist, entire body visible from top of head to bottom of shoes with generous white space, seamless pure white studio background, soft even professional e-commerce lighting, subtle realistic shadow beneath feet, natural skin texture, accurate fabric detail, deep focus, sharp focus on face, hands, dress and shoes, realistic proportions, centered symmetrical composition, portrait orientation, no blur, no shallow depth of field, no low neckline, no mini skirt, no tight bodycon fit, no bare shoulders, no cropped feet, no text, no logo, no watermark";

  return generateImage({ prompt });
}

/**
 * Render a palette look — a figure dressed from an approved colour palette, with no
 * garment photos involved. The flat colour chart carries the exact hex values.
 */
export async function renderPaletteLookImage({
  departmentName = null,
  gender,
  palette,
  notes = null,
  baseFigureUrl,
}: {
  /** Optional — palette looks are not department-scoped. */
  departmentName?: string | null;
  gender: Gender;
  palette: PaletteColor[];
  /** Optional free-text styling direction from the branch leader. */
  notes?: string | null;
  baseFigureUrl: string | null;
}): Promise<Buffer> {
  const prompt = buildPalettePrompt({
    departmentName,
    gender,
    palette,
    notes,
    hasFigureReference: !!baseFigureUrl,
  });

  const references: ReferenceImage[] = [];
  if (baseFigureUrl) references.push(await referenceFromUrl(baseFigureUrl, "base-figure.png"));
  references.push(await swatchReference(palette));

  return editImage({ prompt, references });
}

export async function persistPreviewImage(
  image: Buffer,
  combinationId: string,
  gender: Gender
): Promise<string> {
  const admin = createAdminClient();
  const path = `composites/${combinationId}/${gender}-${Date.now()}.png`;

  const { error } = await admin.storage
    .from("combination-previews")
    .upload(path, image, { contentType: "image/png", upsert: true });

  if (error) throw error;

  const { data: { publicUrl } } = admin.storage
    .from("combination-previews")
    .getPublicUrl(path);

  return publicUrl;
}

/** Render one gender's look and write its composite URL onto the combination. */
export async function renderAndPersistLook(
  combinationId: string,
  input: RenderLookInput
): Promise<string> {
  const image = await renderLookImage(input);
  const url = await persistPreviewImage(image, combinationId, input.gender);

  await previewDb()
    .from("combinations")
    .update({ [input.gender === "male" ? "male_composite_url" : "female_composite_url"]: url })
    .eq("id", combinationId);

  return url;
}

/**
 * Flip preview_status to ready once every gender that has zone items has a composite.
 *
 * Gender-aware on purpose: a male-only combination must still reach 'ready'.
 */
export async function checkAndMarkReady(combinationId: string): Promise<void> {
  const db = previewDb();

  const { data: zoneItems } = await db
    .from("combination_zone_items")
    .select("gender")
    .eq("combination_id", combinationId) as unknown as { data: Array<{ gender: string }> | null };

  const genders = new Set((zoneItems ?? []).map((item) => item.gender));
  const needsMale = genders.has("male");
  const needsFemale = genders.has("female");
  if (!needsMale && !needsFemale) return;

  const { data } = await db
    .from("combinations")
    .select("male_composite_url, female_composite_url")
    .eq("id", combinationId)
    .single() as { data: { male_composite_url: string | null; female_composite_url: string | null } | null };

  const maleReady = !needsMale || !!data?.male_composite_url;
  const femaleReady = !needsFemale || !!data?.female_composite_url;

  if (maleReady && femaleReady) {
    await db.from("combinations").update({ preview_status: "ready" }).eq("id", combinationId);
  }
}

export async function markPreviewFailed(combinationId: string): Promise<void> {
  await previewDb()
    .from("combinations")
    .update({ preview_status: "failed" })
    .eq("id", combinationId);
}
