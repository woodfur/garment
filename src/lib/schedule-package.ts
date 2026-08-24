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
  items?: Array<{ label: string; hex?: string | null }>;
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

type DepartmentPage = {
  departmentName: string;
  assignments: PreparedAssignment[];
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

function textLine(text: string, x: number, y: number, size: number, font = "F1"): string {
  return `BT /${font} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(text)}) Tj ET\n`;
}

function approxTextWidth(text: string, size: number): number {
  return text.length * size * 0.48;
}

function centeredText(text: string, centerX: number, y: number, size: number, font = "F1"): string {
  return textLine(text, centerX - approxTextWidth(text, size) / 2, y, size, font);
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

function hexToPdfRgb(hex: string): [number, number, number] | null {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return null;
  const value = hex.slice(1);
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  ];
}

function genderTitle(gender: Gender): string {
  return gender === "female" ? "Ladies" : "Men";
}

function itemsFor(assignment: PreparedAssignment): Array<{ label: string; hex?: string | null }> {
  return assignment.items && assignment.items.length > 0
    ? assignment.items
    : [{ label: assignment.combinationName }];
}

function groupDepartmentPages(assignments: PreparedAssignment[]): DepartmentPage[] {
  const pages: DepartmentPage[] = [];
  for (const assignment of assignments) {
    let page = pages.find((candidate) => candidate.departmentName === assignment.departmentName);
    if (!page) {
      page = { departmentName: assignment.departmentName, assignments: [] };
      pages.push(page);
    }
    page.assignments.push(assignment);
  }
  return pages.length > 0 ? pages : [{ departmentName: "Uniforms", assignments: [] }];
}

function drawBreakdownItem(item: { label: string; hex?: string | null }, centerX: number, y: number): string {
  let content = "";
  const swatch = item.hex ? hexToPdfRgb(item.hex) : null;
  if (swatch) {
    const [red, green, blue] = swatch;
    const textWidth = approxTextWidth(item.label, 12);
    const swatchX = centerX - textWidth / 2 - 16;
    content += `${red.toFixed(3)} ${green.toFixed(3)} ${blue.toFixed(3)} rg\n`;
    content += `${swatchX.toFixed(2)} ${(y - 1).toFixed(2)} 8.00 8.00 re f\n`;
    content += "0.70 0.66 0.58 RG\n";
    content += `${swatchX.toFixed(2)} ${(y - 1).toFixed(2)} 8.00 8.00 re S\n`;
  }
  content += "0.18 0.16 0.14 rg\n";
  content += centeredText(item.label, centerX, y, 12, "F3");
  return content;
}

function buildColumnContent(assignment: PreparedAssignment | null, x: number, y: number, width: number, imageNames: Map<PreparedAssignment, string>): string {
  const centerX = x + width / 2;
  const imageY = y + 150;
  const imageH = 380;
  let content = "1 1 1 rg\n";
  content += `${x.toFixed(2)} ${imageY.toFixed(2)} ${width.toFixed(2)} ${imageH.toFixed(2)} re f\n`;

  if (assignment?.image) {
    const name = imageNames.get(assignment);
    if (name) content += drawImage(name, assignment.image, x, imageY + 8, width, imageH - 16);
  } else {
    content += "0.84 0.81 0.74 RG\n";
    content += `${x.toFixed(2)} ${imageY.toFixed(2)} ${width.toFixed(2)} ${imageH.toFixed(2)} re S\n`;
    content += "0.42 0.38 0.34 rg\n";
    content += centeredText("Rendered uniform not available", centerX, imageY + imageH / 2, 10, "F1");
  }

  const title = assignment ? genderTitle(assignment.gender) : "Uniform";
  content += "0.13 0.11 0.10 rg\n";
  content += centeredText(title, centerX, y + 104, 23, "F2");

  if (assignment) {
    itemsFor(assignment).slice(0, 9).forEach((item, index) => {
      content += drawBreakdownItem(item, centerX, y + 78 - index * 16);
    });
  }
  return content;
}

function buildPageContent(input: SchedulePackageInput, page: DepartmentPage, imageNames: Map<PreparedAssignment, string>, pageNumber: number, totalPages: number): string {
  let content = "0.95 0.93 0.89 rg\n";
  content += `0 0 ${PAGE_WIDTH.toFixed(2)} ${PAGE_HEIGHT.toFixed(2)} re f\n`;

  content += "0.34 0.31 0.27 rg\n";
  content += textLine(input.branchName, MARGIN, 792, 15, "F3");
  content += "0.13 0.11 0.10 rg\n";
  content += textLine(page.departmentName, MARGIN, 758, 30, "F2");
  content += "0.43 0.23 0.40 rg\n";
  content += textLine(`${input.serviceTitle} - ${formatDate(input.serviceDate)}`, MARGIN, 733, 15, "F3");
  content += "0.76 0.72 0.65 RG\n";
  content += `${MARGIN.toFixed(2)} 721.00 m ${(PAGE_WIDTH - MARGIN).toFixed(2)} 721.00 l S\n`;
  if (input.notes) {
    const note = wrapText(input.notes, 92).slice(0, 2);
    note.forEach((line, index) => {
      content += "0.34 0.31 0.27 rg\n";
      content += textLine(line, MARGIN, 704 - index * 13, 9, "F1");
    });
  }

  const female = page.assignments.find((assignment) => assignment.gender === "female") ?? null;
  const male = page.assignments.find((assignment) => assignment.gender === "male") ?? null;
  const gap = 22;
  const columnW = (PAGE_WIDTH - MARGIN * 2 - gap) / 2;
  const columnY = 92;
  content += buildColumnContent(female, MARGIN, columnY, columnW, imageNames);
  content += buildColumnContent(male, MARGIN + columnW + gap, columnY, columnW, imageNames);

  if (input.publicScheduleUrl) {
    content += "0.20 0.18 0.16 rg\n";
    content += textLine(input.publicScheduleUrl, MARGIN, 34, 8, "F1");
  }
  content += textLine(`Page ${pageNumber} of ${totalPages}`, PAGE_WIDTH - MARGIN - 52, 34, 8, "F1");
  return content;
}

export async function createSchedulePackagePdf(input: SchedulePackageInput): Promise<Buffer> {
  const prepared: PreparedAssignment[] = await Promise.all(
    input.assignments.map(async (assignment) => ({
      ...assignment,
      image: await prepareImage(assignment.imageUrl),
    })),
  );

  const pages = groupDepartmentPages(prepared);

  const pdf = new PdfBuilder();
  const pagesId = pdf.reserve();
  const fontId = pdf.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const serifFontId = pdf.add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>");
  const serifBoldFontId = pdf.add("<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>");
  const pageIds: number[] = [];

  pages.forEach((page, pageIndex) => {
    const imageNames = new Map<PreparedAssignment, string>();
    const xObjectEntries: string[] = [];
    page.assignments.forEach((assignment) => {
      if (!assignment.image) return;
      const imageId = pdf.add(pdf.stream(
        `/Type /XObject /Subtype /Image /Width ${assignment.image.width} /Height ${assignment.image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`,
        assignment.image.data,
      ));
      const name = `Im${imageId}`;
      imageNames.set(assignment, name);
      xObjectEntries.push(`/${name} ${imageId} 0 R`);
    });

    const content = buildPageContent(input, page, imageNames, pageIndex + 1, pages.length);
    const contentId = pdf.add(pdf.stream("", content));
    const resources = [
      `/Font << /F1 ${fontId} 0 R /F2 ${serifBoldFontId} 0 R /F3 ${serifFontId} 0 R >>`,
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
