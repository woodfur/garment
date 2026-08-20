import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/server";
export { buildPaletteLookName, buildPalettePrompt, validatePalette } from "@/lib/palette-prompt";
import type { PaletteColor } from "@/lib/palette-prompt";

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
  personImage,
  palette,
  title,
  departmentName,
}: {
  /** Rendered person image bytes — gpt-image-2 returns base64, so there is no URL to fetch. */
  personImage: Buffer;
  palette: PaletteColor[];
  title: string;
  departmentName: string;
}): Promise<Buffer> {
  const person = await sharp(personImage)
    .resize({ width: 690, height: 1280, fit: "cover", position: "top", withoutEnlargement: true })
    .sharpen({ sigma: 0.85, m1: 1, m2: 2 })
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
    .png({ compressionLevel: 6 })
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
  const path = `palette/${branchId}/${combinationId}-${Date.now()}.png`;
  const { error } = await admin.storage
    .from("combination-previews")
    .upload(path, image, { contentType: "image/png", upsert: true });

  if (error) throw error;

  const { data: { publicUrl } } = admin.storage
    .from("combination-previews")
    .getPublicUrl(path);

  return publicUrl;
}
