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
  composite:   "viktorfa/catviton:latest",
  compositeFallback: "cuuupid/idm-vton:latest",
  animation:   "stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3d",
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
  const firstItem = orderedZoneItems[0];

  const meta: CompositeJobMeta = {
    combination_id: combinationId,
    gender,
    sequence_index: 0,
    total_steps: totalSteps,
    job_type: `composite_${gender}_step_0`,
  };

  const prediction = await replicate.predictions.create({
    model: MODELS.composite,
    input: {
      human_img: baseCharacterUrl,
      garm_img:  firstItem.uniform_image_url,
      garment_des: firstItem.uniform_name,
      is_checked: true,
      is_checked_crop: false,
      denoise_steps: 30,
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
    next_uniform_id: orderedZoneItems.length > 1 ? null : null, // next handled in webhook
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
    model: MODELS.composite,
    input: {
      human_img: currentImageUrl,
      garm_img:  nextItem.uniform_image_url,
      garment_des: nextItem.uniform_name,
      is_checked: true,
      is_checked_crop: false,
      denoise_steps: 30,
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
    model: MODELS.animation,
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

  const url = Array.isArray(output) ? output[0] : String(output);
  if (!url) throw new Error("Character generation returned no output");
  return url;
}

// ---------------------------------------------------------------------------
// getPredictionStatus (used by dev polling)
// ---------------------------------------------------------------------------
export async function getPredictionStatus(predictionId: string) {
  return replicate.predictions.get(predictionId);
}

// ---------------------------------------------------------------------------
// Dev-only: poll and continue composite chain
// ---------------------------------------------------------------------------
async function pollAndContinueChain(
  predictionId: string,
  combinationId: string,
  gender: Gender,
  allItems: ZoneItem[],
  currentIndex: number,
  currentImageUrl: string,
  attempt = 0
) {
  const MAX_ATTEMPTS = 200; // ~10 min at 3s intervals
  if (attempt > MAX_ATTEMPTS) {
    await markFailed(combinationId, predictionId);
    return;
  }

  await sleep(3000);
  const prediction = await getPredictionStatus(predictionId);

  if (prediction.status === "failed" || prediction.status === "canceled") {
    await markFailed(combinationId, predictionId);
    return;
  }

  if (prediction.status !== "succeeded") {
    return pollAndContinueChain(predictionId, combinationId, gender, allItems, currentIndex, currentImageUrl, attempt + 1);
  }

  const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : String(prediction.output ?? "");
  const admin = createAdminClient();
  const db = admin as any;
  await db.from("replicate_jobs").update({ status: "done", current_image_url: outputUrl }).eq("prediction_id", predictionId);

  const nextIndex = currentIndex + 1;
  if (nextIndex < allItems.length) {
    // Continue chain
    const nextId = await compositeNextGarment(outputUrl, allItems[nextIndex], combinationId, gender, nextIndex, allItems.length);
    void pollAndContinueChain(nextId, combinationId, gender, allItems, nextIndex, outputUrl);
  } else {
    // Chain complete — store composite, start animation
    const col = gender === "male" ? "male_composite_url" : "female_composite_url";
    await db.from("combinations").update({ [col]: outputUrl }).eq("id", combinationId);
    void generateVideoFromImage(outputUrl, combinationId, gender);
  }
}

// ---------------------------------------------------------------------------
// Dev-only: poll and finalise video
// ---------------------------------------------------------------------------
async function pollAndFinaliseVideo(
  predictionId: string,
  combinationId: string,
  gender: Gender,
  attempt = 0
) {
  const MAX_ATTEMPTS = 200;
  if (attempt > MAX_ATTEMPTS) {
    await markFailed(combinationId, predictionId);
    return;
  }

  await sleep(3000);
  const prediction = await getPredictionStatus(predictionId);

  if (prediction.status === "failed" || prediction.status === "canceled") {
    await markFailed(combinationId, predictionId);
    return;
  }

  if (prediction.status !== "succeeded") {
    return pollAndFinaliseVideo(predictionId, combinationId, gender, attempt + 1);
  }

  const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : String(prediction.output ?? "");
  const admin = createAdminClient();
  const db = admin as any;
  const col = gender === "male" ? "male_gif_url" : "female_gif_url";
  await db.from("replicate_jobs").update({ status: "done" }).eq("prediction_id", predictionId);
  await db.from("combinations").update({ [col]: outputUrl }).eq("id", combinationId);

  // GAP-11 FIX: Use gender-aware readiness check
  await checkAndMarkReady(combinationId);
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
  const allFailed = (jobs as Array<{ status: string }> | null)?.every((j) => j.status === "failed" || j.status === "done");
  if (allFailed) {
    await db.from("combinations").update({ preview_status: "failed" }).eq("id", combinationId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
