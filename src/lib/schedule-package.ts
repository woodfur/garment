import sharp from "sharp";
import type { Gender } from "@/types/database";

type PackageFilenameInput = {
  branchName: string;
  serviceTitle: string;
  serviceDate: string;
};

export type PackageCombinationAsset = {
  male_composite_url: string | null;
  female_composite_url: string | null;
  male_gif_url: string | null;
  female_gif_url: string | null;
};

export type SchedulePackageAssignment = {
  departmentName: string;
  gender: Gender;
  combinationName: string;
  imageUrl: string | null;
};

export type SchedulePackageInput = PackageFilenameInput & {
  notes: string | null;
  publicScheduleUrl?: string | null;
  assignments: SchedulePackageAssignment[];
};

type PreparedImage = {
  data: Buffer;
  width: number;
  height: number;
};

type PreparedAssignment = SchedulePackageAssignment & {
  image: PreparedImage | null;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 42;

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

export function buildSchedulePackageFilename(input: PackageFilenameInput): string {
  const base = [
    slugify(input.branchName),
    slugify(input.serviceTitle),
    input.serviceDate,
  ].filter(Boolean).join("-");
  return `${base || "service-schedule"}.pdf`;
}

export function formatAssignmentLabel({
  departmentName,
  gender,
}: {
  departmentName: string;
  gender: Gender;
}): string {
  return `${departmentName} - ${gender === "male" ? "Male" : "Female"}`;
}

export function pickAssignmentAsset({
  gender,
  combination,
}: {
  gender: Gender | null;
  combination: PackageCombinationAsset | null;
}): string | null {
  if (!gender || !combination) return null;
  if (gender === "male") return combination.male_composite_url || combination.male_gif_url;
  return combination.female_composite_url || combination.female_gif_url;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function formatDate(serviceDate: string): string {
  return new Date(`${serviceDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function textLine(text: string, x: number, y: number, size: number): string {
  return `BT /F1 ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(text)}) Tj ET\n`;
}

function wrapText(value: string, maxChars: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function prepareImage(url: string | null): Promise<PreparedImage | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const source = Buffer.from(await response.arrayBuffer());
    const data = await sharp(source)
      .rotate()
      .resize({ width: 900, height: 900, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#fbf9f4" })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    const metadata = await sharp(data).metadata();
    if (!metadata.width || !metadata.height) return null;
    return { data, width: metadata.width, height: metadata.height };
  } catch {
    return null;
  }
}

class PdfBuilder {
  private objects: Array<Buffer | null> = [];

  reserve(): number {
    this.objects.push(null);
    return this.objects.length;
  }

  add(content: string | Buffer): number {
    this.objects.push(Buffer.isBuffer(content) ? content : Buffer.from(content));
    return this.objects.length;
  }

  set(id: number, content: string | Buffer): void {
    this.objects[id - 1] = Buffer.isBuffer(content) ? content : Buffer.from(content);
  }

  stream(dict: string, data: string | Buffer): Buffer {
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
    return Buffer.concat([
      Buffer.from(`<< ${dict} /Length ${body.length} >>\nstream\n`),
      body,
      Buffer.from("\nendstream"),
    ]);
  }

  render(rootId: number): Buffer {
    const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")];
    const offsets = [0];
    for (let i = 0; i < this.objects.length; i += 1) {
      const object = this.objects[i];
      if (!object) throw new Error(`PDF object ${i + 1} was not written`);
      offsets.push(Buffer.concat(parts).length);
      parts.push(Buffer.from(`${i + 1} 0 obj\n`), object, Buffer.from("\nendobj\n"));
    }
    const xrefOffset = Buffer.concat(parts).length;
    const xref = [
      "xref",
      `0 ${this.objects.length + 1}`,
      "0000000000 65535 f ",
      ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `),
      "trailer",
      `<< /Size ${this.objects.length + 1} /Root ${rootId} 0 R >>`,
      "startxref",
      String(xrefOffset),
      "%%EOF",
      "",
    ].join("\n");
    parts.push(Buffer.from(xref));
    return Buffer.concat(parts);
  }
}

function drawImage(name: string, image: PreparedImage, x: number, y: number, maxW: number, maxH: number): string {
  const scale = Math.min(maxW / image.width, maxH / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const dx = x + (maxW - width) / 2;
  const dy = y + (maxH - height) / 2;
  return `q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)} cm /${name} Do Q\n`;
}

function buildPageContent(input: SchedulePackageInput, assignments: PreparedAssignment[], imageNames: Map<PreparedAssignment, string>, pageNumber: number, totalPages: number): string {
  let content = "0.13 0.11 0.10 rg\n";
  content += textLine(input.branchName, MARGIN, 792, 22);
  content += textLine(`${input.serviceTitle} - ${formatDate(input.serviceDate)}`, MARGIN, 766, 13);
  if (input.notes) {
    const note = wrapText(input.notes, 86).slice(0, 2);
    note.forEach((line, index) => {
      content += textLine(line, MARGIN, 744 - index * 14, 9);
    });
  }

  const gap = 18;
  const cardW = (PAGE_WIDTH - MARGIN * 2 - gap) / 2;
  const cardH = 260;
  const gridTop = 692;

  assignments.forEach((assignment, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + col * (cardW + gap);
    const y = gridTop - row * 285 - cardH;

    content += "0.98 0.97 0.94 rg\n";
    content += `${x.toFixed(2)} ${y.toFixed(2)} ${cardW.toFixed(2)} ${cardH.toFixed(2)} re f\n`;
    content += "0.82 0.78 0.70 RG\n";
    content += `${x.toFixed(2)} ${y.toFixed(2)} ${cardW.toFixed(2)} ${cardH.toFixed(2)} re S\n`;
    content += "0.13 0.11 0.10 rg\n";
    content += textLine(formatAssignmentLabel(assignment), x + 14, y + cardH - 28, 13);
    wrapText(assignment.combinationName, 32).slice(0, 2).forEach((line, lineIndex) => {
      content += textLine(line, x + 14, y + cardH - 48 - lineIndex * 13, 9);
    });

    const imageX = x + 16;
    const imageY = y + 42;
    const imageW = cardW - 32;
    const imageH = 150;
    if (assignment.image) {
      const name = imageNames.get(assignment);
      if (name) content += drawImage(name, assignment.image, imageX, imageY, imageW, imageH);
    } else {
      content += "0.88 0.85 0.78 RG\n";
      content += `${imageX.toFixed(2)} ${imageY.toFixed(2)} ${imageW.toFixed(2)} ${imageH.toFixed(2)} re S\n`;
      content += textLine("Rendered uniform not available", imageX + 18, imageY + 74, 9);
    }
  });

  if (input.publicScheduleUrl) {
    content += textLine(input.publicScheduleUrl, MARGIN, 34, 8);
  }
  content += textLine(`Page ${pageNumber} of ${totalPages}`, PAGE_WIDTH - MARGIN - 52, 34, 8);
  return content;
}

export async function createSchedulePackagePdf(input: SchedulePackageInput): Promise<Buffer> {
  const prepared: PreparedAssignment[] = await Promise.all(
    input.assignments.map(async (assignment) => ({
      ...assignment,
      image: await prepareImage(assignment.imageUrl),
    })),
  );

  const chunks: PreparedAssignment[][] = [];
  for (let index = 0; index < prepared.length; index += 4) {
    chunks.push(prepared.slice(index, index + 4));
  }
  if (chunks.length === 0) chunks.push([]);

  const pdf = new PdfBuilder();
  const pagesId = pdf.reserve();
  const fontId = pdf.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds: number[] = [];

  chunks.forEach((assignments, pageIndex) => {
    const imageNames = new Map<PreparedAssignment, string>();
    const xObjectEntries: string[] = [];
    assignments.forEach((assignment) => {
      if (!assignment.image) return;
      const imageId = pdf.add(pdf.stream(
        `/Type /XObject /Subtype /Image /Width ${assignment.image.width} /Height ${assignment.image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
        assignment.image.data,
      ));
      const name = `Im${imageId}`;
      imageNames.set(assignment, name);
      xObjectEntries.push(`/${name} ${imageId} 0 R`);
    });

    const content = buildPageContent(input, assignments, imageNames, pageIndex + 1, chunks.length);
    const contentId = pdf.add(pdf.stream("", content));
    const resources = [
      `/Font << /F1 ${fontId} 0 R >>`,
      xObjectEntries.length > 0 ? `/XObject << ${xObjectEntries.join(" ")} >>` : "",
    ].filter(Boolean).join(" ");
    const pageId = pdf.add([
      "<< /Type /Page",
      `/Parent ${pagesId} 0 R`,
      `/MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}]`,
      `/Resources << ${resources} >>`,
      `/Contents ${contentId} 0 R`,
      ">>",
    ].join(" "));
    pageIds.push(pageId);
  });

  pdf.set(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
  const catalogId = pdf.add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  return pdf.render(catalogId);
}
