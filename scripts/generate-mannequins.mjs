/**
 * One-time script: generate mannequin base images via Replicate and upload to Supabase.
 * Writes NEXT_PUBLIC_MANNEQUIN_MALE_URL and NEXT_PUBLIC_MANNEQUIN_FEMALE_URL to .env.local
 *
 * Run with: node scripts/generate-mannequins.mjs
 *
 * Reads credentials from .env.local automatically.
 * Uses Replicate SDK v1.4+ FileOutput stream API (not CDN URLs which expire quickly).
 */

import { createClient } from "@supabase/supabase-js";
import Replicate from "replicate";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, "..", ".env.local");

// Read credentials from .env.local
const envRaw = fs.readFileSync(ENV_PATH, "utf8");
const env = Object.fromEntries(
  envRaw.split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const REPLICATE_API_KEY = env.REPLICATE_API_KEY || env.REPLICATE_API_TOKEN;
const CHARACTER_GEN_MODEL = "black-forest-labs/flux-dev";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !REPLICATE_API_KEY) {
  console.error("❌ Missing required env vars in .env.local:");
  console.error("   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REPLICATE_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const replicate = new Replicate({ auth: REPLICATE_API_KEY });

const PROMPTS = {
  male: "Full body portrait of a young adult African man, neutral standing pose, arms slightly away from body, plain white background, high quality fashion photography, front view, full length head to toe, minimal plain white t-shirt and grey trousers, professional studio lighting",
  female: "Full body portrait of a young adult African woman, neutral standing pose, arms slightly away from body, plain white background, high quality fashion photography, front view, full length head to toe, minimal plain white blouse and grey trousers, professional studio lighting",
};

/** Read a ReadableStream (FileOutput) into a Buffer */
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function generateAndUpload(gender) {
  console.log(`\n🎨 Generating ${gender} character via Replicate Flux Dev...`);

  const output = await replicate.run(CHARACTER_GEN_MODEL, {
    input: {
      prompt: PROMPTS[gender],
      width: 768,
      height: 1024,
      num_outputs: 1,
      go_fast: false,
      guidance: 3.5,
      num_inference_steps: 28,
    },
  });

  // SDK v1.4+ returns FileOutput objects (implement ReadableStream + .url())
  const fileOutput = Array.isArray(output) ? output[0] : output;
  if (!fileOutput) throw new Error(`No output for ${gender}`);

  const imageUrl = typeof fileOutput.url === "function"
    ? fileOutput.url().href
    : String(fileOutput);
  console.log(`✅ Generated: ${imageUrl}`);

  // Read stream directly — more reliable than downloading from expiring CDN URL
  console.log(`📥 Reading image stream...`);
  let buffer;
  if (typeof fileOutput[Symbol.asyncIterator] === "function") {
    buffer = await streamToBuffer(fileOutput);
  } else {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
  }
  console.log(`   ${Math.round(buffer.length / 1024)} KB`);

  console.log(`📤 Uploading to Supabase mannequins bucket...`);
  const filePath = `${gender}-character.png`;
  const { error } = await supabase.storage
    .from("mannequins")
    .upload(filePath, buffer, { contentType: "image/png", upsert: true });

  if (error) throw new Error(`Upload failed for ${gender}: ${error.message}`);

  const { data: { publicUrl } } = supabase.storage.from("mannequins").getPublicUrl(filePath);
  console.log(`✅ Uploaded: ${publicUrl}`);
  return publicUrl;
}

function updateEnvFile(maleUrl, femaleUrl) {
  let content = fs.readFileSync(ENV_PATH, "utf8");
  content = content.split("\n").filter(l => !l.startsWith("NEXT_PUBLIC_MANNEQUIN_")).join("\n");
  if (!content.endsWith("\n")) content += "\n";
  content += `NEXT_PUBLIC_MANNEQUIN_MALE_URL=${maleUrl}\n`;
  content += `NEXT_PUBLIC_MANNEQUIN_FEMALE_URL=${femaleUrl}\n`;
  fs.writeFileSync(ENV_PATH, content);
  console.log("\n📝 .env.local updated.");
}

async function main() {
  console.log("🚀 Garment — Mannequin Generator");
  console.log("=================================");
  console.log("Generating characters sequentially (Replicate burst limit = 1)...");

  const maleUrl = await generateAndUpload("male");
  const femaleUrl = await generateAndUpload("female");

  updateEnvFile(maleUrl, femaleUrl);

  console.log("\n🎉 Done!");
  console.log(`   NEXT_PUBLIC_MANNEQUIN_MALE_URL=${maleUrl}`);
  console.log(`   NEXT_PUBLIC_MANNEQUIN_FEMALE_URL=${femaleUrl}`);
  console.log("\n⚠️  Restart the dev server to pick up the new env vars.");
}

main().catch(err => { console.error("\n❌", err.message); process.exit(1); });
