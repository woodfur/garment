import sharp from "sharp";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Gender } from "@/types/database";

/**
 * One department's uniform for one service, rendered as a single shareable PNG.
 *
 * This replaces the image a leader currently forwards into a department WhatsApp group:
 * both figures side by side, the garments named underneath each, and the service it is
 * for in the header. A PDF is the wrong artefact for that — nobody forwards a PDF into a
 * group chat — so this is deliberately one flat image.
 *
 * Layout maths is kept pure and tested; only renderShareCard touches sharp.
 */

/**
 * A line under a figure: a garment name, or an approved colour.
 *
 * Colours carry their hex so the card can show a swatch — a congregation member needs
 * "cream" with the colour beside it, not "#E6D7C3".
 */
export type ShareCardItem = { label: string; hex?: string };

export type ShareCardColumn = {
  gender: Gender;
  /** Rendered look image. Null when the preview is not ready yet. */
  image: Buffer | null;
  lookName: string;
  /** Garments in layer order, or the approved colours for a palette look. */
  items: ShareCardItem[];
};

export type ShareCardInput = {
  branchName: string;
  departmentName: string;
  serviceTitle: string;
  serviceDate: string;
  columns: ShareCardColumn[];
};

const WIDTH = 1200;
const MARGIN = 48;
const HEADER_HEIGHT = 172;
const IMAGE_HEIGHT = 900;
/** Collapsed height when no figure has rendered yet, so the card is not mostly blank. */
const EMPTY_IMAGE_HEIGHT = 96;
const SWATCH = 18;
const LINE_HEIGHT = 34;
const CAPTION_TOP_GAP = 28;
const FOOTER_HEIGHT = 56;
const CARD_FONT_FAMILY = "GarmentCard, Arial, Helvetica, sans-serif";

const GENDER_HEADING: Record<Gender, string> = { female: "Ladies", male: "Men" };
let cachedFontCss: string | null = null;

/** Order columns the way the WhatsApp posts read: Ladies on the left, Men on the right. */
export function orderColumns(columns: ShareCardColumn[]): ShareCardColumn[] {
  const rank = (gender: Gender) => (gender === "female" ? 0 : 1);
  return [...columns].sort((a, b) => rank(a.gender) - rank(b.gender));
}

export function formatServiceDate(serviceDate: string): string {
  // Parsed as local midnight so a date-only string cannot slip to the previous day.
  const date = new Date(`${serviceDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return serviceDate;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(date);
}

export function buildShareCardFilename({
  departmentName,
  serviceDate,
}: {
  departmentName: string;
  serviceDate: string;
}): string {
  const slug = departmentName
    .trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "uniform"}-${serviceDate}.png`;
}

/**
 * Card height depends on the longest garment list, so a department with many pieces does
 * not get its text clipped.
 */
export function imageBandHeight(columns: ShareCardColumn[]): number {
  return columns.some((column) => column.image) ? IMAGE_HEIGHT : EMPTY_IMAGE_HEIGHT;
}

export function shareCardHeight(columns: ShareCardColumn[]): number {
  const longestList = columns.reduce((max, column) => Math.max(max, column.items.length + 1), 1);
  return HEADER_HEIGHT + imageBandHeight(columns) + CAPTION_TOP_GAP + longestList * LINE_HEIGHT + FOOTER_HEIGHT;
}

/** Evenly split the content width, so one column fills the card and two sit side by side. */
export function columnGeometry(count: number): Array<{ x: number; width: number }> {
  const usable = WIDTH - MARGIN * 2;
  const gap = count > 1 ? 32 : 0;
  const columnWidth = Math.floor((usable - gap * (count - 1)) / count);
  return Array.from({ length: count }, (_, index) => ({
    x: MARGIN + index * (columnWidth + gap),
    width: columnWidth,
  }));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function cardFontCss(): string {
  if (cachedFontCss) return cachedFontCss;
  try {
    const font = readFileSync(join(process.cwd(), "public", "fonts", "geist-regular.ttf")).toString("base64");
    cachedFontCss = `@font-face{font-family:GarmentCard;src:url(data:font/ttf;base64,${font}) format('truetype');font-weight:400 800;font-style:normal;}`;
  } catch {
    cachedFontCss = "";
  }
  return cachedFontCss;
}

/** Trim a garment name that would overflow its column rather than letting it run off. */
export function truncateForColumn(text: string, columnWidth: number): string {
  const maxChars = Math.max(8, Math.floor(columnWidth / 11));
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

export function buildShareCardSvg(input: ShareCardInput): string {
  const columns = orderColumns(input.columns);
  const height = shareCardHeight(columns);
  const geometry = columnGeometry(columns.length);
  const band = imageBandHeight(columns);

  const headings = columns.map((column, index) => {
    const { x, width } = geometry[index];
    const centre = x + width / 2;
    const captionTop = HEADER_HEIGHT + band + CAPTION_TOP_GAP;

    const heading = `<text x="${centre}" y="${captionTop}" text-anchor="middle" font-family="${CARD_FONT_FAMILY}" font-size="34" font-weight="700" fill="#211C19">${escapeXml(GENDER_HEADING[column.gender])}</text>`;

    const lines = column.items.map((item, itemIndex) => {
      const y = captionTop + (itemIndex + 1) * LINE_HEIGHT;
      const label = escapeXml(truncateForColumn(item.label, width - (item.hex ? SWATCH + 12 : 0)));
      if (!item.hex) {
        return `<text x="${centre}" y="${y}" text-anchor="middle" font-family="${CARD_FONT_FAMILY}" font-size="22" fill="#4A443C">${label}</text>`;
      }
      // Swatch sits to the left of a left-aligned label so the pair reads as one unit.
      const textX = centre - width / 4 + SWATCH + 12;
      return `<rect x="${centre - width / 4}" y="${y - SWATCH + 3}" width="${SWATCH}" height="${SWATCH}" rx="3" fill="${escapeXml(item.hex)}" stroke="#DCD5C7"/>`
        + `<text x="${textX}" y="${y}" font-family="${CARD_FONT_FAMILY}" font-size="22" fill="#4A443C">${label}</text>`;
    }).join("");

    const placeholder = column.image
      ? ""
      : `<text x="${centre}" y="${HEADER_HEIGHT + band / 2 + 8}" text-anchor="middle" font-family="${CARD_FONT_FAMILY}" font-size="22" fill="#9A9183">Preview not ready yet</text>`;

    return placeholder + heading + lines;
  }).join("");

  return `
    <svg width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs><style>${cardFontCss()}</style></defs>
      <rect width="${WIDTH}" height="${height}" fill="#F4F1EA"/>
      <text x="${MARGIN}" y="60" font-family="${CARD_FONT_FAMILY}" font-size="26" fill="#6E665C">${escapeXml(input.branchName)}</text>
      <text x="${MARGIN}" y="112" font-family="${CARD_FONT_FAMILY}" font-size="46" font-weight="700" fill="#211C19">${escapeXml(input.departmentName)}</text>
      <text x="${MARGIN}" y="150" font-family="${CARD_FONT_FAMILY}" font-size="24" fill="#7C4E78">${escapeXml(input.serviceTitle)} · ${escapeXml(formatServiceDate(input.serviceDate))}</text>
      <line x1="${MARGIN}" y1="${HEADER_HEIGHT - 8}" x2="${WIDTH - MARGIN}" y2="${HEADER_HEIGHT - 8}" stroke="#DCD5C7" stroke-width="2"/>
      ${headings}
    </svg>
  `;
}

export async function renderShareCard(input: ShareCardInput): Promise<Buffer> {
  const columns = orderColumns(input.columns);
  if (columns.length === 0) throw new Error("renderShareCard requires at least one gender");

  const height = shareCardHeight(columns);
  const geometry = columnGeometry(columns.length);

  const overlays: sharp.OverlayOptions[] = [
    { input: Buffer.from(buildShareCardSvg({ ...input, columns })), left: 0, top: 0 },
  ];

  for (const [index, column] of columns.entries()) {
    if (!column.image) continue;
    const { x, width } = geometry[index];
    const resized = await sharp(column.image)
      .resize({ width, height: imageBandHeight(columns), fit: "contain", background: "#F4F1EA" })
      .toBuffer();
    overlays.push({ input: resized, left: x, top: HEADER_HEIGHT });
  }

  return sharp({
    create: { width: WIDTH, height, channels: 4, background: "#F4F1EA" },
  })
    .composite(overlays)
    .png({ compressionLevel: 6 })
    .toBuffer();
}
