/**
 * src/lib/replicate.ts
 * Centralised Replicate API wrapper for:
 *  - Character generation (Flux Dev) — one-time
 *  - Garment compositing chain (CatVTON) — per combination
 *  - Video animation (Stable Video Diffusion) — per character
 */

import Replicate from "replicate";
import { createAdminClient } from "@/lib/supabase/server";
import type { BodyZone, Gender } from "@/types/database";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_KEY! });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
const IS_PROD = process.env.NODE_ENV === "production" && APP_URL !== "";

// ---------------------------------------------------------------------------
// Model identifiers
// ---------------------------------------------------------------------------
const MODELS = {
  // cuuupid/idm-vton — explicit version hash required for predictions.create().
  // ':latest' tag only works with replicate.run(), not predictions.create().
  // Version 0513734a = latest as of 2025-03-25 (updated from old e3893af4 version).
  composite:   "cuuupid/idm-vton:0513734a452173b8173e907e3a59d19a36266e55b48528559432bd21c7d7e985",
  // stability-ai/stable-video-diffusion — predictions.create({ version }) needs the full version hash.
  animation:   "3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438",
  characterGen: "black-forest-labs/flux-dev",
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ZoneItem {
  zone: BodyZone;
  uniform_id: string;
  uniform_image_url: string;
  uniform_name: string;
}

/** A colour-based piece — no photo; rendered into the figure via a Flux text prompt. */
export interface ColorZoneItem {
  zone: BodyZone;
  category: string;
  color: string;             // hex, e.g. "#3A6B8C"
  color_label: string | null;
}

export interface CompositeJobMeta {
  combination_id: string;
  gender: Gender;
  sequence_index: number;
  total_steps: number;
  job_type: string;
}

// ---------------------------------------------------------------------------
// Internal: build webhook URL
// ---------------------------------------------------------------------------
function webhookUrl(meta: CompositeJobMeta): string | undefined {
  if (!IS_PROD) return undefined;
  const params = new URLSearchParams({
    combination_id: meta.combination_id,
    gender: meta.gender,
    sequence_index: String(meta.sequence_index),
    total_steps: String(meta.total_steps),
    job_type: meta.job_type,
  });
  return `${APP_URL}/api/webhooks/replicate?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Internal: map body zone to IDM-VTON category enum
// ---------------------------------------------------------------------------
function zoneToCategory(zone: string): "upper_body" | "lower_body" | "dresses" {
  if (zone === "bottom" || zone === "footwear") return "lower_body";
  if (zone === "full_body") return "dresses";
  // top, outer, head, accessory_* → upper_body
  return "upper_body";
}

// ---------------------------------------------------------------------------
// startCompositeChain
// Fires the first garment compositing job and inserts a replicate_jobs row.
// The webhook (prod) or poll loop (dev) continues the chain.
// ---------------------------------------------------------------------------
export async function startCompositeChain(
  combinationId: string,
  gender: Gender,
  orderedZoneItems: ZoneItem[],  // already sorted by ZONE_LAYER_ORDER, filtered to assigned only
  baseCharacterUrl: string
): Promise<{ predictionId: string }> {
  const admin = createAdminClient();
  // Cast to any for replicate_jobs — table exists in DB but not yet in generated TS types
  const db = admin as any;

  const totalSteps = orderedZoneItems.length;
  // GAP-7 FIX: Guard against empty input — startCompositeChain is called from the route
  // which pre-validates, but direct API callers could bypass that check.
  if (totalSteps === 0) {
    throw new Error("orderedZoneItems must not be empty — at least one zone item is required");
  }
  const firstItem = orderedZoneItems[0];

  const meta: CompositeJobMeta = {
    combination_id: combinationId,
    gender,
    sequence_index: 0,
    total_steps: totalSteps,
    job_type: `composite_${gender}_step_0`,
  };

  const prediction = await replicate.predictions.create({
    version: MODELS.composite,
    input: {
      human_img: baseCharacterUrl,
      garm_img:  firstItem.uniform_image_url,
      garment_des: firstItem.uniform_name,
      // New IDM-VTON schema: category enum instead of is_checked/is_checked_crop
      category: zoneToCategory(firstItem.zone),
      crop: true, // mannequin images may not be exactly 3:4 ratio
      steps: 30,
      seed: 42,
    },
    ...(IS_PROD ? { webhook: webhookUrl(meta), webhook_events_filter: ["completed"] } : {}),
  });

  // Store job row
  await db.from("replicate_jobs").insert({
    combination_id: combinationId,
    prediction_id: prediction.id,
    job_type: meta.job_type,
    gender,
    sequence_index: 0,
    total_steps: totalSteps,
    current_image_url: baseCharacterUrl,
    next_uniform_id: null, // intentionally null — webhook re-fetches ordered zone items from DB
    status: "pending",
  });

  // In dev: start polling loop
  if (!IS_PROD) {
    void pollAndContinueChain(prediction.id, combinationId, gender, orderedZoneItems, 0, baseCharacterUrl);
  }

  return { predictionId: prediction.id };
}

// ---------------------------------------------------------------------------
// compositeNextGarment
// Called from webhook handler (prod) or poll loop (dev) to fire the next step.
// ---------------------------------------------------------------------------
export async function compositeNextGarment(
  currentImageUrl: string,
  nextItem: ZoneItem,
  combinationId: string,
  gender: Gender,
  sequenceIndex: number,
  totalSteps: number
): Promise<string> {
  const admin = createAdminClient();
  const db = admin as any;

  const meta: CompositeJobMeta = {
    combination_id: combinationId,
    gender,
    sequence_index: sequenceIndex,
    total_steps: totalSteps,
    job_type: `composite_${gender}_step_${sequenceIndex}`,
  };

  const prediction = await replicate.predictions.create({
    version: MODELS.composite,
    input: {
      human_img: currentImageUrl,
      garm_img:  nextItem.uniform_image_url,
      garment_des: nextItem.uniform_name,
      category: zoneToCategory(nextItem.zone),
      crop: true,
      steps: 30,
      seed: 42,
    },
    ...(IS_PROD ? { webhook: webhookUrl(meta), webhook_events_filter: ["completed"] } : {}),
  });

  await db.from("replicate_jobs").insert({
    combination_id: combinationId,
    prediction_id: prediction.id,
    job_type: meta.job_type,
    gender,
    sequence_index: sequenceIndex,
    total_steps: totalSteps,
    current_image_url: currentImageUrl,
    status: "pending",
  });

  return prediction.id;
}

// ---------------------------------------------------------------------------
// generateVideoFromImage
// Fires Stable Video Diffusion to animate the final composite image.
// ---------------------------------------------------------------------------
export async function generateVideoFromImage(
  compositeImageUrl: string,
  combinationId: string,
  gender: Gender
): Promise<string> {
  const admin = createAdminClient();
  const db = admin as any;

  const jobType = `gif_${gender}`;
  const meta: CompositeJobMeta = {
    combination_id: combinationId,
    gender,
    sequence_index: 0,
    total_steps: 1,
    job_type: jobType,
  };

  const prediction = await replicate.predictions.create({
    version: MODELS.animation,
    input: {
      input_image: compositeImageUrl,
      frames_per_second: 6,
      video_length: "14_frames_with_svd",
      sizing_strategy: "maintain_aspect_ratio",
      motion_bucket_id: 40,
      cond_aug: 0.02,
    },
    ...(IS_PROD ? { webhook: webhookUrl(meta), webhook_events_filter: ["completed"] } : {}),
  });

  await db.from("replicate_jobs").insert({
    combination_id: combinationId,
    prediction_id: prediction.id,
    job_type: jobType,
    gender,
    sequence_index: 0,
    total_steps: 1,
    current_image_url: compositeImageUrl,
    status: "pending",
  });

  // Dev: poll for completion
  if (!IS_PROD) {
    void pollAndFinaliseVideo(prediction.id, combinationId, gender);
  }

  return prediction.id;
}

// ---------------------------------------------------------------------------
// generateCharacterImage (one-time admin use)
// ---------------------------------------------------------------------------
export async function generateCharacterImage(gender: Gender): Promise<string> {
  const prompt = gender === "male"
    ? "Full body portrait of a young adult African man, neutral standing pose, arms slightly away from body, plain white background, high quality fashion photography, front view, full length head to toe, minimal plain white t-shirt and grey trousers, professional studio lighting"
    : "Full body portrait of a young adult African woman, neutral standing pose, arms slightly away from body, plain white background, high quality fashion photography, front view, full length head to toe, minimal plain white blouse and grey trousers, professional studio lighting";

  const output = await replicate.run(MODELS.characterGen as `${string}/${string}`, {
    input: {
      prompt,
      width: 768,
      height: 1024,
      num_outputs: 1,
      go_fast: false,
      guidance: 3.5,
      num_inference_steps: 28,
    },
  });

  const raw = Array.isArray(output) ? output[0] : output;

  // GAP-9 FIX: SDK v1.4+ may return FileOutput (ReadableStream) for some models.
  // String(stream) returns '[object ReadableStream]' which passes the !url guard.
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    throw new Error("generateCharacterImage: unexpected non-string output — check Replicate SDK version");
  }

  const url = String(raw ?? "");
  if (!url) throw new Error("Character generation returned no output");
  return url;
}

export async function generatePalettePersonImage(prompt: string): Promise<string> {
  const output = await replicate.run(MODELS.characterGen as `${string}/${string}`, {
    input: {
      prompt,
      aspect_ratio: "3:4",
      num_outputs: 1,
      num_inference_steps: 28,
      guidance: 3.5,
      output_format: "png",
      go_fast: false,
    },
  });

  const raw = Array.isArray(output) ? output[0] : output;

  if (raw && typeof raw === "object" && "url" in raw && typeof raw.url === "function") {
    return String(raw.url());
  }

  if (raw && typeof raw === "object") {
    throw new Error("generatePalettePersonImage: unexpected non-string output");
  }

  const url = String(raw ?? "");
  if (!url) throw new Error("Palette generation returned no output");
  return url;
}

// ---------------------------------------------------------------------------
// Colour-based looks — build a Flux prompt from colour swatches
// ---------------------------------------------------------------------------
const GARMENT_NOUN: Record<string, string> = {
  top:       "shirt",
  full_body: "dress",
  outer:     "jacket",
  bottom:    "trousers",
  footwear:  "shoes",
  head:      "hat",
  accessory: "accessory",
};

/** Nearest basic colour name from a small palette — keeps the Flux prompt literal. */
function hexToColorName(hex: string): string {
  const palette: Array<[string, [number, number, number]]> = [
    ["black", [0, 0, 0]], ["white", [255, 255, 255]], ["grey", [128, 128, 128]],
    ["silver", [192, 192, 192]], ["charcoal", [54, 54, 54]],
    ["red", [200, 30, 30]], ["maroon", [120, 20, 20]], ["orange", [230, 126, 34]],
    ["gold", [212, 175, 55]], ["yellow", [240, 220, 60]], ["cream", [245, 240, 220]],
    ["green", [40, 150, 60]], ["olive", [110, 120, 50]], ["teal", [30, 140, 140]],
    ["navy", [20, 30, 90]], ["blue", [40, 90, 200]], ["sky blue", [120, 180, 230]],
    ["purple", [120, 50, 150]], ["plum", [90, 40, 85]], ["pink", [230, 130, 180]],
    ["brown", [110, 70, 40]], ["tan", [190, 150, 110]], ["beige", [225, 200, 160]],
  ];
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  let best = palette[0][0], bestD = Infinity;
  for (const [name, [pr, pg, pb]] of palette) {
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

function buildColorPrompt(gender: Gender, colorItems: ColorZoneItem[]): string {
  const person = gender === "male" ? "young adult African man" : "young adult African woman";
  const order = ["head", "outer", "full_body", "top", "bottom", "footwear", "accessory"];
  const sorted = [...colorItems].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category));
  const clauses = sorted.map((it) => `a ${hexToColorName(it.color)} ${GARMENT_NOUN[it.category] ?? "garment"}`);
  const garments = clauses.length > 1
    ? `${clauses.slice(0, -1).join(", ")} and ${clauses[clauses.length - 1]}`
    : (clauses[0] ?? "plain clothing");
  return `Full body fashion photograph of a ${person} wearing ${garments}, neutral standing pose, arms slightly away from body, plain white background, professional studio lighting, front view, full length head to toe, high quality realistic fashion photography`;
}

// ---------------------------------------------------------------------------
// startColorBaseGeneration
// Generates (via Flux) a figure wearing the COLOUR pieces. The result becomes the
// base for any photo pieces (chained via IDM-VTON), or — if the look is all colour —
// the final composite that gets animated. Mirrors startCompositeChain's prod/dev split.
// ---------------------------------------------------------------------------
export async function startColorBaseGeneration(
  combinationId: string,
  gender: Gender,
  colorItems: ColorZoneItem[],
  photoItems: ZoneItem[],   // photo pieces to chain on top afterwards (may be empty)
): Promise<{ predictionId: string }> {
  const admin = createAdminClient();
  const db = admin as any;

  if (colorItems.length === 0) {
    throw new Error("startColorBaseGeneration requires at least one colour item");
  }

  const meta: CompositeJobMeta = {
    combination_id: combinationId,
    gender,
    sequence_index: 0,
    total_steps: photoItems.length,
    job_type: `colorbase_${gender}`,
  };

  const prediction = await replicate.predictions.create({
    model: MODELS.characterGen,
    input: {
      prompt: buildColorPrompt(gender, colorItems),
      aspect_ratio: "3:4",
      num_outputs: 1,
      num_inference_steps: 28,
      guidance: 3.5,
      output_format: "png",
      go_fast: false,
    },
    ...(IS_PROD ? { webhook: webhookUrl(meta), webhook_events_filter: ["completed"] } : {}),
  });

  await db.from("replicate_jobs").insert({
    combination_id: combinationId,
    prediction_id: prediction.id,
    job_type: meta.job_type,
    gender,
    sequence_index: 0,
    total_steps: photoItems.length,
    current_image_url: null,
    next_uniform_id: null,
    status: "pending",
  });

  if (!IS_PROD) {
    void pollAndContinueColorBase(prediction.id, combinationId, gender, photoItems);
  }

  return { predictionId: prediction.id };
}

// ---------------------------------------------------------------------------
// getPredictionStatus (used by dev polling)
// ---------------------------------------------------------------------------
export async function getPredictionStatus(predictionId: string) {
  return replicate.predictions.get(predictionId);
}

// ---------------------------------------------------------------------------
// Dev-only: poll the colour-base (Flux) job, then chain photos or finalise.
// Prod uses the webhook's `colorbase_` branch instead.
// ---------------------------------------------------------------------------
async function pollAndContinueColorBase(
  predictionId: string,
  combinationId: string,
  gender: Gender,
  photoItems: ZoneItem[],
) {
  const MAX_ATTEMPTS = 200;
  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
    await sleep(3000);
    const prediction = await getPredictionStatus(predictionId);

    if (prediction.status === "failed" || prediction.status === "canceled") {
      await markFailed(combinationId, predictionId);
      return;
    }
    if (prediction.status !== "succeeded") continue;

    const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : String(prediction.output ?? "");
    if (!outputUrl) {
      await markFailed(combinationId, predictionId, "Colour base generation returned no output URL");
      return;
    }

    const admin = createAdminClient();
    const db = admin as any;
    await db.from("replicate_jobs").update({ status: "completed", current_image_url: outputUrl }).eq("prediction_id", predictionId);

    if (photoItems.length > 0) {
      // Chain photo garments on top of the generated colour base.
      void startCompositeChain(combinationId, gender, photoItems, outputUrl);
    } else {
      // All-colour look — the Flux output IS the composite. Animate it.
      const col = gender === "male" ? "male_composite_url" : "female_composite_url";
      await db.from("combinations").update({ [col]: outputUrl }).eq("id", combinationId);
      await generateVideoFromImage(outputUrl, combinationId, gender);
    }
    return;
  }
  await markFailed(combinationId, predictionId);
}

// ---------------------------------------------------------------------------
// Dev-only: poll and continue composite chain (iterative — no frame accumulation)
// ---------------------------------------------------------------------------
async function pollAndContinueChain(
  predictionId: string,
  combinationId: string,
  gender: Gender,
  allItems: ZoneItem[],
  currentIndex: number,
  currentImageUrl: string
) {
  const MAX_ATTEMPTS = 200; // ~10 min at 3s intervals

  // GAP-4 FIX: Iterative loop instead of tail recursion.
  // Recursion with await sleep() suspends each frame — up to 200 frames would accumulate.
  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
    await sleep(3000);
    const prediction = await getPredictionStatus(predictionId);

    if (prediction.status === "failed" || prediction.status === "canceled") {
      await markFailed(combinationId, predictionId);
      return;
    }

    if (prediction.status !== "succeeded") continue;

    // Succeeded — process result
    const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : String(prediction.output ?? "");

    // GAP-3 FIX: Guard against empty outputUrl (prediction.output was null/undefined/[]).
    // The webhook handler has this guard; the dev poll loop was missing it.
    if (!outputUrl) {
      await markFailed(combinationId, predictionId, "Prediction succeeded but returned no output URL");
      return;
    }

    const admin = createAdminClient();
    const db = admin as any;
    await db.from("replicate_jobs").update({ status: "completed", current_image_url: outputUrl }).eq("prediction_id", predictionId);

    const nextIndex = currentIndex + 1;
    if (nextIndex < allItems.length) {
      // Continue chain — each step polls its own prediction in a separate async task.
      // GAP-1 NOTE: This spawn is intentional fire-and-forget; predictionId changes per step
      // so each chain step must independently poll its own Replicate prediction.
      const nextId = await compositeNextGarment(outputUrl, allItems[nextIndex], combinationId, gender, nextIndex, allItems.length);
      void pollAndContinueChain(nextId, combinationId, gender, allItems, nextIndex, outputUrl);
    } else {
      // Chain complete — store composite, start animation
      const col = gender === "male" ? "male_composite_url" : "female_composite_url";
      await db.from("combinations").update({ [col]: outputUrl }).eq("id", combinationId);
      await generateVideoFromImage(outputUrl, combinationId, gender);
    }
    return;
  }

  // Exceeded max attempts
  await markFailed(combinationId, predictionId);
}

// ---------------------------------------------------------------------------
// Dev-only: poll and finalise video (iterative — no frame accumulation)
// ---------------------------------------------------------------------------
async function pollAndFinaliseVideo(
  predictionId: string,
  combinationId: string,
  gender: Gender
) {
  const MAX_ATTEMPTS = 200;

  // GAP-4 FIX: Iterative loop instead of tail recursion.
  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
    await sleep(3000);
    const prediction = await getPredictionStatus(predictionId);

    if (prediction.status === "failed" || prediction.status === "canceled") {
      await markFailed(combinationId, predictionId);
      return;
    }

    if (prediction.status !== "succeeded") continue;

    // Succeeded — store GIF URL and check readiness
    const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : String(prediction.output ?? "");

    // GAP-1 C10 FIX: Guard against empty outputUrl — mirrors the same guard in pollAndContinueChain.
    // Without this, an empty string gets written to male_gif_url/female_gif_url, making
    // checkAndMarkReady() permanently return false and hanging the combination in 'processing'.
    if (!outputUrl) {
      await markFailed(combinationId, predictionId, "Video prediction succeeded but returned no output URL");
      return;
    }

    const admin = createAdminClient();
    const db = admin as any;
    const col = gender === "male" ? "male_gif_url" : "female_gif_url";
    await db.from("replicate_jobs").update({ status: "completed" }).eq("prediction_id", predictionId);
    await db.from("combinations").update({ [col]: outputUrl }).eq("id", combinationId);
    await checkAndMarkReady(combinationId);
    return;
  }

  // Exceeded max attempts
  await markFailed(combinationId, predictionId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * GAP-11 FIX: Checks if the combination preview is ready based on which
 * genders have zone items assigned. Only requires GIFs for genders that
 * actually have items — a male-only combination marks ready after male GIF.
 */
async function checkAndMarkReady(combinationId: string) {
  const admin = createAdminClient();
  const db = admin as any;

  // Determine which genders have zone assignments
  const { data: zoneItems } = await db
    .from("combination_zone_items")
    .select("gender")
    .eq("combination_id", combinationId);

  const genders = new Set<string>((zoneItems ?? []).map((i: { gender: string }) => i.gender));
  const needsMale   = genders.has("male");
  const needsFemale = genders.has("female");

  // No zone items at all — skip
  if (!needsMale && !needsFemale) return;

  const { data: combo } = await db
    .from("combinations")
    .select("male_gif_url, female_gif_url")
    .eq("id", combinationId)
    .single() as { data: { male_gif_url: string | null; female_gif_url: string | null } | null };

  const maleReady   = !needsMale   || !!combo?.male_gif_url;
  const femaleReady = !needsFemale || !!combo?.female_gif_url;

  if (maleReady && femaleReady) {
    await db.from("combinations").update({ preview_status: "ready" }).eq("id", combinationId);
  }
}

async function markFailed(combinationId: string, predictionId: string, reason = "Prediction failed or exceeded retry limit") {
  const admin = createAdminClient();
  const db = admin as any;
  await db.from("replicate_jobs")
    .update({ status: "failed", error_message: reason })
    .eq("prediction_id", predictionId);
  // Check if ALL active jobs for this combination are failed
  const { data: jobs } = await db.from("replicate_jobs").select("status").eq("combination_id", combinationId);
  const allFailed = (jobs as Array<{ status: string }> | null)?.every((j) => j.status === "failed" || j.status === "completed");
  if (allFailed) {
    await db.from("combinations").update({ preview_status: "failed" }).eq("id", combinationId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
