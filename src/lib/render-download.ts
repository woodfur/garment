import type { Gender } from "@/types/database";

export type DownloadableRender = {
  name: string;
  male_composite_url: string | null;
  female_composite_url: string | null;
  male_gif_url: string | null;
  female_gif_url: string | null;
};

export type RenderedAsset = {
  url: string;
  fallbackExtension: string;
};

export function parseDownloadGender(value: string | null): Gender | null {
  if (value === "male" || value === "female") return value;
  return null;
}

export function getRenderedAsset(combo: DownloadableRender, gender: Gender): RenderedAsset | null {
  const compositeUrl = gender === "male" ? combo.male_composite_url : combo.female_composite_url;
  if (compositeUrl) return { url: compositeUrl, fallbackExtension: "webp" };

  const gifUrl = gender === "male" ? combo.male_gif_url : combo.female_gif_url;
  if (gifUrl) return { url: gifUrl, fallbackExtension: "gif" };

  return null;
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildRenderedFilename({
  combinationName,
  gender,
  extension,
}: {
  combinationName: string;
  gender: Gender;
  extension: string;
}): string {
  const basename = slugify(combinationName) || "uniform-render";
  const cleanExtension = extension.replace(/[^a-z0-9]/gi, "").toLowerCase() || "webp";
  return `${basename}-${gender}.${cleanExtension}`;
}

export function extensionFromContentType(contentType: string | null, fallback: string): string {
  if (!contentType) return fallback;
  if (contentType.includes("png")) return "png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
  if (contentType.includes("gif")) return "gif";
  if (contentType.includes("webp")) return "webp";
  return fallback;
}
