import OpenAI, { toFile } from "openai";

/**
 * OpenAI image generation — the rendering engine for all uniform previews.
 *
 * Pinned to gpt-image-2, which follows colour and composition instructions far more
 * literally than the Flux/IDM-VTON pipeline this replaced. Two capabilities matter here:
 *  - `images.edit` accepts up to 16 reference images, so a whole look renders in ONE call
 *    instead of chaining a prediction per garment.
 *  - Passing colours as an actual swatch image (rather than hex text) is what makes the
 *    palette come out right — see palette-swatch.ts.
 *
 * Notes on the model, verified against the SDK types (openai@7.4.0):
 *  - `model` defaults to gpt-image-1.5 on edits, so it is always passed explicitly.
 *  - GPT image models always return base64; there is no URL response mode.
 *  - `background: "transparent"` is NOT supported — background removal stays on Replicate.
 *  - `input_fidelity` is documented as unsupported for gpt-image-2, so it is omitted.
 */

const MODEL = "gpt-image-2";

/** Portrait full-body framing — matches the 3:4 aspect the old Flux prompts used. */
export const PORTRAIT_SIZE = "1024x1536";

/** Hard API limit for gpt-image-2 edits. */
export const MAX_REFERENCE_IMAGES = 16;

export type ImageQuality = "low" | "medium" | "high";

export type ReferenceImage = {
  data: Buffer;
  filename: string;
  contentType: string;
};

let _client: OpenAI | null = null;

function client(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");
  if (!_client) _client = new OpenAI({ apiKey });
  return _client;
}

/** Download an image URL into a reference the edit endpoint can accept. */
export async function referenceFromUrl(url: string, filename: string): Promise<ReferenceImage> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download reference image: ${filename}`);

  const contentType = response.headers.get("content-type") ?? "image/png";
  return {
    data: Buffer.from(await response.arrayBuffer()),
    filename,
    contentType: SUPPORTED_INPUT_TYPES.has(contentType) ? contentType : "image/png",
  };
}

const SUPPORTED_INPUT_TYPES = new Set(["image/png", "image/webp", "image/jpeg"]);

function firstImage(response: OpenAI.Images.ImagesResponse, context: string): Buffer {
  const encoded = response.data?.[0]?.b64_json;
  if (!encoded) throw new Error(`${context}: OpenAI returned no image data`);
  return Buffer.from(encoded, "base64");
}

/** Wrap OpenAI failures in messages that are safe to surface to a branch leader. */
function describeFailure(error: unknown, context: string): Error {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 400 && String(error.code ?? "").includes("moderation")) {
      return new Error(
        `${context}: the image request was rejected by OpenAI's content filter. Try different wording or garment photos.`
      );
    }
    if (error.status === 429) {
      return new Error(`${context}: OpenAI rate limit reached. Wait a moment and try again.`);
    }
    return new Error(`${context}: OpenAI error ${error.status} — ${error.message}`);
  }
  return error instanceof Error ? error : new Error(`${context}: unknown error`);
}

export async function generateImage({
  prompt,
  size = PORTRAIT_SIZE,
  quality = "high",
}: {
  prompt: string;
  size?: string;
  quality?: ImageQuality;
}): Promise<Buffer> {
  try {
    const response = await client().images.generate({
      model: MODEL,
      prompt,
      size,
      quality,
      n: 1,
      output_format: "png",
    });
    return firstImage(response, "Image generation");
  } catch (error) {
    throw describeFailure(error, "Image generation");
  }
}

/**
 * Render an image from a prompt plus reference images.
 *
 * References are ordered — the prompt refers to them by position, so callers must keep
 * the order they describe. Anything beyond MAX_REFERENCE_IMAGES is rejected rather than
 * silently truncated, because a dropped garment would produce a wrong-but-plausible look.
 */
export async function editImage({
  prompt,
  references,
  size = PORTRAIT_SIZE,
  quality = "high",
}: {
  prompt: string;
  references: ReferenceImage[];
  size?: string;
  quality?: ImageQuality;
}): Promise<Buffer> {
  if (references.length === 0) throw new Error("editImage requires at least one reference image");
  if (references.length > MAX_REFERENCE_IMAGES) {
    throw new Error(
      `Too many reference images (${references.length}); gpt-image-2 accepts at most ${MAX_REFERENCE_IMAGES}`
    );
  }

  try {
    const uploads = await Promise.all(
      references.map((reference) =>
        toFile(reference.data, reference.filename, { type: reference.contentType })
      )
    );

    const response = await client().images.edit({
      model: MODEL,
      image: uploads,
      prompt,
      size,
      quality,
      n: 1,
      output_format: "png",
    });
    return firstImage(response, "Image edit");
  } catch (error) {
    throw describeFailure(error, "Image edit");
  }
}
