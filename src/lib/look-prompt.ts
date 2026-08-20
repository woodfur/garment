// Explicit .ts extension so this module resolves both under Turbopack and under
// `node --test`, which cannot map a .js specifier onto a .ts file.
import { colorPromptPhrase } from "./palette-prompt.ts";
import type { Gender } from "@/types/database";

/**
 * Turns a look into an ordered reference-image list plus the prompt that describes it.
 *
 * Kept pure and free of `@/` imports so it runs under `node --test` and so the whole
 * ordering contract can be verified without calling OpenAI. The caller supplies items
 * already sorted by ZONE_LAYER_ORDER; this module never re-sorts, because the prompt
 * addresses reference images by position and the two must not drift apart.
 */

export type LookPhotoItem = {
  zone: string;
  uniformName: string;
  imageUrl: string;
};

export type LookColorItem = {
  zone: string;
  category: string;
  hex: string;
};

export type ReferenceSlot =
  | { kind: "figure" }
  | { kind: "chart" }
  | { kind: "garment"; item: LookPhotoItem };

export type LookPlan = {
  slots: ReferenceSlot[];
  prompt: string;
};

/** Reference images are addressed by ordinal in the prompt, so the words must be stable. */
const ORDINALS = [
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth",
  "ninth", "tenth", "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth",
];

export function ordinal(index: number): string {
  return ORDINALS[index] ?? `image number ${index + 1}`;
}

/**
 * Modesty and styling rules per garment slot.
 *
 * These constraints are the product, not boilerplate — the organisation requires covered
 * shoulders and chest, knee-to-mid-calf skirts, and closed-toe shoes on every render.
 */
function garmentClause(gender: Gender, category: string, descriptor: string): string {
  if (gender === "female") {
    if (category === "top") return `${descriptor} modest high-neck blouse or church uniform top with covered shoulders`;
    if (category === "bottom") return `${descriptor} knee-to-mid-calf A-line church uniform skirt`;
    if (category === "full_body") return `${descriptor} modest knee-to-mid-calf A-line church uniform dress with a covered chest`;
    if (category === "outer") return `${descriptor} tailored church uniform jacket or blazer`;
    if (category === "footwear") return `${descriptor} glossy closed-toe low-heel court shoes`;
    if (category === "head") return `${descriptor} modest church headpiece`;
    return `${descriptor} modest church uniform accessory`;
  }

  // Deliberately sleeve-agnostic: pinning "short-sleeve" here fought every suit look,
  // since a jacket in the outer zone layers over this shirt. Let the reference photo or
  // the approved colour decide the sleeves.
  if (category === "top") return `${descriptor} collared church uniform shirt`;
  if (category === "bottom") return `${descriptor} tailored church uniform trousers`;
  if (category === "full_body") return `${descriptor} coordinated modest church uniform suit or matching two-piece outfit`;
  if (category === "outer") return `${descriptor} tailored church uniform jacket or blazer`;
  if (category === "footwear") return `${descriptor} glossy black closed-toe dress shoes`;
  if (category === "head") return `${descriptor} modest church hat`;
  return `${descriptor} modest church uniform accessory`;
}

/** Zones map onto the same garment vocabulary the colour path uses. */
export function zoneToCategory(zone: string): string {
  if (zone.startsWith("accessory_")) return "accessory";
  return zone;
}

function structureRule(gender: Gender, categories: Set<string>): string {
  const twoPiece = categories.has("top") && categories.has("bottom") && !categories.has("full_body");
  if (!twoPiece) {
    return "Render only the described garment slots and keep every visible garment modest, structured, and appropriate for church service";
  }
  return gender === "female"
    ? "The outfit must be a clearly separated two-piece female church uniform: blouse or top on the upper body and a knee-to-mid-calf A-line skirt on the lower body; do not generate a dress, jumpsuit, romper, shorts, trousers, off-shoulder top, strapless top, or mini skirt"
    : "The outfit must be a clearly separated two-piece male church uniform: collared shirt on the upper body and tailored trousers on the lower body; do not generate a robe, jumpsuit, shorts, or casual outfit";
}

export function planLook({
  gender,
  colorItems,
  photoItems,
  hasFigureReference,
}: {
  gender: Gender;
  colorItems: LookColorItem[];
  photoItems: LookPhotoItem[];
  hasFigureReference: boolean;
}): LookPlan {
  if (colorItems.length === 0 && photoItems.length === 0) {
    throw new Error("planLook requires at least one colour or photo item");
  }

  const slots: ReferenceSlot[] = [];
  if (hasFigureReference) slots.push({ kind: "figure" });
  if (colorItems.length > 0) slots.push({ kind: "chart" });
  for (const item of photoItems) slots.push({ kind: "garment", item });

  const person = gender === "male" ? "adult Black African man" : "adult Black African woman";
  const subject = hasFigureReference
    ? `Redress the ${person} church uniform model in the first reference photograph, keeping their face, body, proportions, pose, and the seamless white studio setting unchanged`
    : `Highly realistic, tack-sharp, full-body white studio clothing-catalogue photograph of one modestly dressed ${person} church uniform model, front-facing with hands gently clasped at the front and the whole body visible from head to shoes`;

  const lines: string[] = [subject];

  const chartIndex = slots.findIndex((slot) => slot.kind === "chart");
  if (chartIndex >= 0) {
    lines.push(
      `the ${ordinal(chartIndex)} reference image is a flat color chart, sample the exact pixel colors from its bars for the garment fabric`,
      "the color chart is a reference swatch only, never draw the chart, its bars, or any color card into the photograph"
    );

    colorItems.forEach((item, barIndex) => {
      const category = zoneToCategory(item.zone);
      const clause = garmentClause(gender, category, "a");
      lines.push(
        `color chart bar ${barIndex + 1} (${colorPromptPhrase(item.hex)}) is the exact fabric color of ${clause}`
      );
    });

    lines.push(
      "CRITICAL COLOR LOCK: match each garment to its chart bar exactly and do not substitute related, darker, warmer, cooler, muted, pastel, redder, or purpler colors"
    );
  }

  slots.forEach((slot, index) => {
    if (slot.kind !== "garment") return;
    const category = zoneToCategory(slot.item.zone);
    const clause = garmentClause(gender, category, "the");
    lines.push(
      `the ${ordinal(index)} reference image is a photograph of the real garment "${slot.item.uniformName}", reproduce its exact fabric color, pattern, and detailing as ${clause} worn by the model`
    );
  });

  const categories = new Set([
    ...colorItems.map((item) => zoneToCategory(item.zone)),
    ...photoItems.map((item) => zoneToCategory(item.zone)),
  ]);

  lines.push(
    structureRule(gender, categories),
    "seamless pure white studio background, soft even professional e-commerce lighting, subtle realistic shadow beneath feet",
    "natural skin texture, accurate fabric detail, deep focus, sharp focus on face, hands, clothing and shoes, realistic proportions, centered symmetrical composition",
    "covered chest, respectful fit, closed-toe dress shoes, no low neckline, no off-shoulder top, no strapless top, no shorts, no mini skirt, no tight bodycon fit, no bare shoulders",
    "no blur, no shallow depth of field, no cropped feet, no text, no color cards, no logos, no watermark"
  );

  return { slots, prompt: lines.join(", ") };
}
