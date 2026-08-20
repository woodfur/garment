import sharp from "sharp";
import type { ReferenceImage } from "@/lib/openai-image";
import type { PaletteColor } from "@/lib/palette-prompt";

/**
 * Renders an approved palette as a flat colour-chart image, used as a reference image
 * for gpt-image-2.
 *
 * This is the core of the colour-accuracy fix. Describing "#CCF755" in prose leaves the
 * model to interpret a name; handing it the actual pixels does not. Two rules keep the
 * chart from leaking into the render:
 *  - No text, labels, or hex codes — the model draws text it sees in reference images.
 *  - No gaps, borders, or background — any padding colour reads as a sixth approved
 *    colour and shows up in the garments.
 */

const CARD_WIDTH = 1024;
const CARD_HEIGHT = 256;

export type SwatchBar = { x: number; width: number; hex: string };

/**
 * Divide the card into equal edge-to-edge bars.
 *
 * Widths are derived from cumulative rounded boundaries rather than a rounded per-bar
 * width, so the bars always tile the full canvas exactly with no seam at the right edge.
 */
export function swatchLayout(palette: PaletteColor[], width = CARD_WIDTH): SwatchBar[] {
  return palette.map((color, index) => {
    const start = Math.round((index * width) / palette.length);
    const end = Math.round(((index + 1) * width) / palette.length);
    return { x: start, width: end - start, hex: color.hex };
  });
}

export function swatchSvg(palette: PaletteColor[], width = CARD_WIDTH, height = CARD_HEIGHT): string {
  const bars = swatchLayout(palette, width)
    .map((bar) => `<rect x="${bar.x}" y="0" width="${bar.width}" height="${height}" fill="${bar.hex}"/>`)
    .join("");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${bars}</svg>`;
}

export async function renderSwatchCard(palette: PaletteColor[]): Promise<Buffer> {
  if (palette.length === 0) throw new Error("renderSwatchCard requires at least one colour");
  return sharp(Buffer.from(swatchSvg(palette))).png().toBuffer();
}

export async function swatchReference(palette: PaletteColor[]): Promise<ReferenceImage> {
  return {
    data: await renderSwatchCard(palette),
    filename: "approved-colour-chart.png",
    contentType: "image/png",
  };
}
