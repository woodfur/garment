import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/server";

export type PaletteColor = {
  hex: string;
  label: string | null;
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textOn(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#211C19" : "#FBF9F4";
}

export function validatePalette(raw: unknown): PaletteColor[] {
  if (!Array.isArray(raw)) throw new Error("palette must be an array");

  const palette = raw.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Each palette color must be an object");
    const candidate = item as { hex?: unknown; label?: unknown };
    if (typeof candidate.hex !== "string" || !HEX_RE.test(candidate.hex)) {
      throw new Error("Each palette color needs a valid hex value");
    }
    const label = typeof candidate.label === "string" && candidate.label.trim()
      ? candidate.label.trim().slice(0, 40)
      : null;
    return { hex: candidate.hex.toUpperCase(), label };
  });

  if (palette.length < 2) throw new Error("Choose at least two colors");
  if (palette.length > 5) throw new Error("Choose no more than five colors");

  return palette;
}

export function buildPalettePrompt({
  departmentName,
  gender,
  palette,
}: {
  departmentName: string;
  gender: "male" | "female";
  palette: PaletteColor[];
}): string {
  const colors = palette.map((color) => color.label ?? color.hex).join(", ");
  const model = gender === "male" ? "male" : "female";
  const garmentGuidance = gender === "male"
    ? "let the outfit naturally distribute the colors across a modest collared shirt, jacket, tailored trousers, shoes, belt, or accessories"
    : "let the outfit naturally distribute the colors across a modest blouse, knee-to-mid-calf A-line skirt, knee-to-mid-calf dress, shoes, belt, or accessories";
  return [
    `Highly realistic, tack-sharp, full-body white studio clothing-catalogue photograph of one modestly dressed adult Black African ${model} church uniform model`,
    `wearing a coordinated church service uniform outfit for the ${departmentName} department`,
    `using this color palette: ${colors}`,
    garmentGuidance,
    "front-facing pose with hands gently clasped or relaxed at the front, head to toe visible",
    "seamless pure white studio background, soft even professional e-commerce lighting, subtle realistic shadow beneath feet",
    "natural skin texture, accurate fabric detail, deep focus, sharp focus on face, hands, clothing and shoes, polished but respectful church styling",
    "covered chest, clearly separate blouse plus knee-to-mid-calf skirt when a two-piece female outfit is used, closed-toe dress shoes, no low neckline, no off-shoulder top, no strapless top, no shorts, no mini skirt, no tight bodycon fit, no bare shoulders",
    "no blur, no shallow depth of field, no cropped feet, no text, no color cards, no logos, no watermark",
  ].join(", ");
}

function paletteSvg({
  palette,
  title,
  departmentName,
}: {
  palette: PaletteColor[];
  title: string;
  departmentName: string;
}): string {
  const width = 420;
  const cardHeight = 230;
  const gap = 26;
  const headerHeight = 104;
  const totalHeight = headerHeight + palette.length * cardHeight + (palette.length - 1) * gap;

  const cards = palette.map((color, index) => {
    const y = headerHeight + index * (cardHeight + gap);
    const label = escapeXml(color.label ?? color.hex);
    const hex = escapeXml(color.hex);
    const ink = textOn(color.hex);
    return `
      <g transform="translate(0 ${y})">
        <rect width="${width}" height="${cardHeight}" rx="0" fill="#FFFFFF"/>
        <rect x="22" y="22" width="${width - 44}" height="132" rx="0" fill="${hex}"/>
        <text x="24" y="188" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="800" fill="#111111">COLOR</text>
        <text x="24" y="214" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="700" fill="#111111">${label}</text>
        <text x="${width - 26}" y="146" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700" fill="${ink}">${hex}</text>
      </g>
    `;
  }).join("");

  return `
    <svg width="${width}" height="${totalHeight}" viewBox="0 0 ${width} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="35" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="800" fill="#211C19">${escapeXml(title)}</text>
      <text x="0" y="68" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#6F6257">${escapeXml(departmentName)}</text>
      ${cards}
    </svg>
  `;
}

export async function createPaletteMoodBoard({
  personImageUrl,
  palette,
  title,
  departmentName,
}: {
  personImageUrl: string;
  palette: PaletteColor[];
  title: string;
  departmentName: string;
}): Promise<Buffer> {
  const personRes = await fetch(personImageUrl);
  if (!personRes.ok) throw new Error("Failed to download generated person image");

  const personBuffer = Buffer.from(await personRes.arrayBuffer());
  const person = await sharp(personBuffer)
    .resize({ width: 690, height: 1280, fit: "cover", position: "top" })
    .toBuffer();

  const swatches = await sharp(Buffer.from(paletteSvg({ palette, title, departmentName })))
    .resize({ width: 420, height: 1240, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: 1200,
      height: 1400,
      channels: 4,
      background: "#F7F1E8",
    },
  })
    .composite([
      { input: person, left: 48, top: 60 },
      { input: swatches, left: 738, top: 80 },
    ])
    .webp({ quality: 90, effort: 4 })
    .toBuffer();
}

export async function uploadPaletteMoodBoard({
  branchId,
  combinationId,
  image,
}: {
  branchId: string;
  combinationId: string;
  image: Buffer;
}): Promise<string> {
  const admin = createAdminClient();
  const path = `palette/${branchId}/${combinationId}-${Date.now()}.webp`;
  const { error } = await admin.storage
    .from("combination-previews")
    .upload(path, image, { contentType: "image/webp", upsert: true });

  if (error) throw error;

  const { data: { publicUrl } } = admin.storage
    .from("combination-previews")
    .getPublicUrl(path);

  return publicUrl;
}
