import sharp from "sharp";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import type { ReactNode } from "react";
import { ImageResponse } from "next/og.js";
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
const CARD_FONT_FAMILY = "GarmentCard";

const GENDER_HEADING: Record<Gender, string> = { female: "Ladies", male: "Men" };
let cachedFontData: Buffer | null = null;

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

function cardFontData(): Buffer {
  if (!cachedFontData) {
    cachedFontData = readFileSync(join(process.cwd(), "public", "fonts", "geist-regular.ttf"));
  }
  return cachedFontData;
}

/** Trim a garment name that would overflow its column rather than letting it run off. */
export function truncateForColumn(text: string, columnWidth: number): string {
  const maxChars = Math.max(8, Math.floor(columnWidth / 11));
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

async function imageResponseToBuffer(response: Response): Promise<Buffer> {
  return Buffer.from(await response.arrayBuffer());
}

function textNode(
  text: string,
  style: Record<string, string | number>,
) {
  return createElement("div", { style }, text);
}

export async function renderShareCardBaseLayer(input: ShareCardInput): Promise<Buffer> {
  const columns = orderColumns(input.columns);
  const height = shareCardHeight(columns);
  const geometry = columnGeometry(columns.length);
  const band = imageBandHeight(columns);

  const columnNodes = columns.flatMap((column, index) => {
    const { x, width } = geometry[index];
    const centre = x + width / 2;
    const captionTop = HEADER_HEIGHT + band + CAPTION_TOP_GAP;
    const nodes: Array<ReactNode | null> = [
      !column.image
        ? textNode("Preview not ready yet", {
            position: "absolute",
            left: x,
            top: HEADER_HEIGHT + band / 2 - 14,
            width,
            textAlign: "center",
            fontSize: 22,
            color: "#9A9183",
            fontFamily: CARD_FONT_FAMILY,
          })
        : null,
      textNode(GENDER_HEADING[column.gender], {
        position: "absolute",
        left: x,
        top: captionTop - 32,
        width,
        textAlign: "center",
        fontSize: 34,
        fontWeight: 700,
        color: "#211C19",
        fontFamily: CARD_FONT_FAMILY,
      }),
    ];

    column.items.forEach((item, itemIndex) => {
      const y = captionTop + (itemIndex + 1) * LINE_HEIGHT - 25;
      const label = truncateForColumn(item.label, width - (item.hex ? SWATCH + 12 : 0));
      if (!item.hex) {
        nodes.push(textNode(label, {
          position: "absolute",
          left: x,
          top: y,
          width,
          textAlign: "center",
          fontSize: 22,
          color: "#4A443C",
          fontFamily: CARD_FONT_FAMILY,
        }));
        return;
      }

      const textX = centre - width / 4 + SWATCH + 12;
      nodes.push(createElement("div", {
        key: `${column.gender}-swatch-${itemIndex}`,
        style: {
          position: "absolute",
          left: centre - width / 4,
          top: y + 5,
          width: SWATCH,
          height: SWATCH,
          borderRadius: 3,
          background: item.hex,
          border: "1px solid #DCD5C7",
        },
      }));
      nodes.push(textNode(label, {
        position: "absolute",
        left: textX,
        top: y,
        width: x + width - textX,
        fontSize: 22,
        color: "#4A443C",
        fontFamily: CARD_FONT_FAMILY,
      }));
    });

    return nodes.filter(Boolean).map((node, nodeIndex) => createElement("div", { key: `${column.gender}-${nodeIndex}`, style: { display: "contents" } }, node));
  });

  const response = new ImageResponse(
    createElement("div", {
      style: {
        display: "flex",
        position: "relative",
        width: `${WIDTH}px`,
        height: `${height}px`,
        background: "#F4F1EA",
        fontFamily: CARD_FONT_FAMILY,
      },
    }, [
      textNode(input.branchName, {
        position: "absolute",
        left: MARGIN,
        top: 36,
        fontSize: 26,
        color: "#6E665C",
        fontFamily: CARD_FONT_FAMILY,
      }),
      textNode(input.departmentName, {
        position: "absolute",
        left: MARGIN,
        top: 75,
        fontSize: 46,
        fontWeight: 700,
        color: "#211C19",
        fontFamily: CARD_FONT_FAMILY,
      }),
      textNode(`${input.serviceTitle} · ${formatServiceDate(input.serviceDate)}`, {
        position: "absolute",
        left: MARGIN,
        top: 130,
        fontSize: 24,
        color: "#7C4E78",
        fontFamily: CARD_FONT_FAMILY,
      }),
      createElement("div", {
        key: "rule",
        style: {
          position: "absolute",
          left: MARGIN,
          top: HEADER_HEIGHT - 9,
          width: WIDTH - MARGIN * 2,
          height: 2,
          background: "#DCD5C7",
        },
      }),
      ...columnNodes,
    ]),
    {
      width: WIDTH,
      height,
      fonts: [{ name: CARD_FONT_FAMILY, data: cardFontData(), weight: 400, style: "normal" }],
    },
  );

  return imageResponseToBuffer(response);
}

export async function renderShareCard(input: ShareCardInput): Promise<Buffer> {
  const columns = orderColumns(input.columns);
  if (columns.length === 0) throw new Error("renderShareCard requires at least one gender");

  const height = shareCardHeight(columns);
  const geometry = columnGeometry(columns.length);

  const overlays: sharp.OverlayOptions[] = [
    { input: await renderShareCardBaseLayer({ ...input, columns }), left: 0, top: 0 },
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
