export type PaletteColor = {
  hex: string;
  label: string | null;
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const FASHION_COLORS = [
  ["black", "#000000"], ["jet black", "#0A0A0A"], ["charcoal", "#36454F"], ["graphite", "#383838"],
  ["slate grey", "#708090"], ["ash grey", "#B2BEB5"], ["silver", "#C0C0C0"], ["pearl grey", "#D9D9D6"],
  ["white", "#FFFFFF"], ["off white", "#FAF9F6"], ["ivory", "#FFFFF0"], ["cream", "#FFFDD0"],
  ["eggshell", "#F0EAD6"], ["vanilla", "#F3E5AB"], ["butter yellow / cream", "#F5E284"], ["champagne", "#F7E7CE"],
  ["beige", "#F5F5DC"], ["sand", "#C2B280"], ["camel", "#C19A6B"], ["khaki", "#C3B091"],
  ["taupe", "#8B8589"], ["mushroom", "#B8A99A"], ["stone", "#8A817C"], ["greige", "#B0A999"],
  ["tan", "#D2B48C"], ["caramel", "#C68E17"], ["cognac", "#9A463D"], ["rust", "#B7410E"],
  ["terracotta", "#E2725B"], ["copper", "#B87333"], ["bronze", "#CD7F32"], ["gold", "#D4AF37"],
  ["mustard", "#FFDB58"], ["ochre", "#CC7722"], ["saffron", "#F4C430"], ["lemon yellow", "#FFF44F"],
  ["yellow", "#FFFF00"], ["chartreuse / lime green", "#CCF755"], ["lime", "#BFFF00"], ["apple green", "#8DB600"],
  ["sage green", "#9CAF88"], ["olive", "#808000"], ["moss green", "#8A9A5B"], ["forest green", "#228B22"],
  ["emerald", "#50C878"], ["kelly green", "#4CBB17"], ["mint green", "#98FF98"], ["seafoam", "#93E9BE"],
  ["teal", "#008080"], ["peacock", "#005F69"], ["turquoise", "#40E0D0"], ["aqua", "#00FFFF"],
  ["cyan", "#00B7EB"], ["powder blue / sky blue", "#94DBFF"], ["baby blue", "#89CFF0"], ["sky blue", "#87CEEB"],
  ["cornflower blue", "#6495ED"], ["periwinkle", "#CCCCFF"], ["cobalt blue", "#0047AB"], ["royal blue", "#4169E1"],
  ["azure", "#007FFF"], ["sapphire", "#0F52BA"], ["indigo", "#4B0082"], ["deep navy", "#00143D"],
  ["navy", "#000080"], ["midnight blue", "#191970"], ["denim blue", "#1560BD"], ["steel blue", "#4682B4"],
  ["lavender", "#E6E6FA"], ["lilac", "#C8A2C8"], ["mauve", "#E0B0FF"], ["violet", "#8F00FF"],
  ["purple", "#800080"], ["plum", "#673147"], ["eggplant", "#614051"], ["aubergine", "#3D0734"],
  ["magenta", "#FF00FF"], ["fuchsia", "#FF00FF"], ["hot pink", "#FF69B4"], ["bubblegum pink", "#FFC1CC"],
  ["blush pink", "#F4C2C2"], ["rose pink", "#FF66CC"], ["dusty rose", "#C08081"], ["salmon", "#FA8072"],
  ["coral", "#FF7F50"], ["peach", "#FFE5B4"], ["apricot", "#FBCEB1"], ["orange", "#FFA500"],
  ["burnt orange", "#D97E08"], ["tangerine", "#F28500"], ["red orange", "#FF5349"], ["scarlet", "#FF2400"],
  ["red", "#FF0000"], ["crimson", "#DC143C"], ["cherry red", "#DE3163"], ["ruby", "#E0115F"],
  ["wine", "#722F37"], ["burgundy", "#800020"], ["maroon", "#800000"], ["oxblood", "#4A0000"],
  ["brown", "#8B4513"], ["chocolate brown", "#704832"], ["espresso", "#4B3621"], ["coffee", "#6F4E37"],
  ["walnut", "#5C4033"], ["mahogany", "#C04000"], ["chestnut", "#954535"],
] as const satisfies ReadonlyArray<readonly [string, `#${string}`]>;

export function validatePalette(raw: unknown): PaletteColor[] {
  if (!Array.isArray(raw)) throw new Error("palette must be an array");

  const palette = raw.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Each palette color must be an object");
    const candidate = item as { hex?: unknown; label?: unknown };
    if (typeof candidate.hex !== "string" || !HEX_RE.test(candidate.hex)) {
      throw new Error("Each palette color needs a valid hex value");
    }
    return { hex: candidate.hex.toUpperCase(), label: null };
  });

  if (palette.length < 2) throw new Error("Choose at least two colors");
  if (palette.length > 5) throw new Error("Choose no more than five colors");

  return palette;
}

/** Nearest human colour name for a hex value, e.g. "#E6D7C3" -> "cream". */
export function nearestColorName(hex: string): string {
  const value = hex.replace("#", "");
  return describeColor(
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  );
}

export function colorPromptPhrase(hex: string): string {
  const normalized = hex.toUpperCase();
  const value = normalized.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);
  return `${describeColor(red, green, blue)} ${normalized} RGB(${red}, ${green}, ${blue})`;
}

function describeColor(red: number, green: number, blue: number): string {
  let best: string = FASHION_COLORS[0][0];
  let bestDistance = Infinity;

  for (const [name, hex] of FASHION_COLORS) {
    const [targetRed, targetGreen, targetBlue] = hexToRgb(hex);
    const distance = colorDistance(red, green, blue, targetRed, targetGreen, targetBlue);
    if (distance < bestDistance) {
      best = name;
      bestDistance = distance;
    }
  }

  return best;
}

function hexToRgb(hex: `#${string}`): [number, number, number] {
  const value = hex.slice(1);
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function colorDistance(
  red: number,
  green: number,
  blue: number,
  targetRed: number,
  targetGreen: number,
  targetBlue: number
): number {
  const redMean = (red + targetRed) / 2;
  const redDiff = red - targetRed;
  const greenDiff = green - targetGreen;
  const blueDiff = blue - targetBlue;
  return ((512 + redMean) * redDiff * redDiff) / 256
    + 4 * greenDiff * greenDiff
    + ((767 - redMean) * blueDiff * blueDiff) / 256;
}

/** Hard cap on free-text direction — long enough to be useful, short enough not to derail. */
export const MAX_PALETTE_NOTES = 400;

/**
 * Clean free-text styling direction before it reaches the prompt.
 *
 * Newlines and runs of whitespace are collapsed because the prompt is one comma-joined
 * sentence; a stray line break just fragments it. Returns null when nothing usable is
 * left, so callers can omit the clause entirely rather than emitting an empty one.
 */
export function sanitizePaletteNotes(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/\s+/g, " ").trim().slice(0, MAX_PALETTE_NOTES);
  return cleaned.length > 0 ? cleaned : null;
}

export function buildPaletteLookName(name: string, palette: PaletteColor[]): string {
  const trimmed = name.trim();
  if (trimmed) return trimmed;

  const first = palette[0]?.hex;
  if (!first) return "Colour palette";
  const colour = nearestColorName(first);
  return `${colour.charAt(0).toUpperCase()}${colour.slice(1)} palette`;
}

export function buildPalettePrompt({
  departmentName = null,
  gender,
  palette,
  notes = null,
  hasFigureReference = false,
}: {
  /** Optional — palette looks apply to every department, so there is usually no single one. */
  departmentName?: string | null;
  gender: "male" | "female";
  palette: PaletteColor[];
  /** Optional free-text styling direction, e.g. a fabric texture or an extra accessory. */
  notes?: string | null;
  /** True when a base mannequin photo precedes the colour chart in the reference list. */
  hasFigureReference?: boolean;
}): string {
  const colors = palette.map((color, index) => `approved color ${index + 1}: ${colorPromptPhrase(color.hex)}`).join("; ");
  const model = gender === "male" ? "male" : "female";
  const garmentGuidance = gender === "male"
    ? "use the approved colors naturally across the modest collared shirt, jacket, tailored trousers, shoes, belt, or accessories"
    : "use the approved colors naturally across the modest blouse, knee-to-mid-calf A-line skirt, dress, shoes, belt, or accessories";

  const subject = hasFigureReference
    ? `Redress the person in the first reference photograph as one modestly dressed adult Black African ${model} church uniform model, keeping their face, body, pose, and the plain white studio setting unchanged`
    : `Highly realistic, tack-sharp, full-body white studio clothing-catalogue photograph of one modestly dressed adult Black African ${model} church uniform model`;

  return [
    subject,
    departmentName
      ? `wearing a coordinated church service uniform outfit for the ${departmentName} department`
      : "wearing a coordinated church service uniform outfit",
    ...colorChartInstructions(hasFigureReference),
    `CRITICAL COLOR LOCK: use only these approved clothing fabric colors and match the hex and RGB values as closely as possible: ${colors}`,
    "The outfit may use one, some, or all approved colors, but every visible clothing fabric color must come from the approved palette",
    "A single-color outfit is allowed when the clothing color is one of the approved colors",
    "Do not substitute related, darker, warmer, cooler, muted, pastel, redder, or purpler colors; no unapproved garment colors",
    garmentGuidance,
    // Placed before the modesty and negative clauses so those still read last and win.
    // Explicitly subordinated to the colour lock, since direction like "add a red scarf"
    // would otherwise fight the whole point of a palette look.
    ...(notes
      ? [`additional styling direction: ${notes}`,
         "apply that direction only within the approved colors and the modest church styling rules"]
      : []),
    "front-facing pose with hands gently clasped or relaxed at the front, head to toe visible",
    "seamless pure white studio background, soft even professional e-commerce lighting, subtle realistic shadow beneath feet",
    "natural skin texture, accurate fabric detail, deep focus, sharp focus on face, hands, clothing and shoes, polished but respectful church styling",
    "covered chest, clearly separate blouse plus knee-to-mid-calf skirt when a two-piece female outfit is used, closed-toe dress shoes, no low neckline, no off-shoulder top, no strapless top, no shorts, no mini skirt, no tight bodycon fit, no bare shoulders",
    "no blur, no shallow depth of field, no cropped feet, no text, no color cards, no logos, no watermark",
  ].join(", ");
}

/**
 * Describes the flat colour-bar reference image produced by palette-swatch.ts.
 *
 * Sampling the supplied pixels is what makes the palette come out right; the explicit
 * "do not draw the chart" clause is required because reference images are otherwise
 * treated as content to include in the render.
 */
export function colorChartInstructions(hasFigureReference = false): string[] {
  const chartPosition = hasFigureReference ? "second" : "first";
  return [
    `the ${chartPosition} reference image is a flat color chart of the approved fabric colors, sample the exact pixel colors from its bars and use them for the clothing`,
    "the color chart is a reference swatch only, never draw the chart, its bars, or any color card into the photograph",
  ];
}
