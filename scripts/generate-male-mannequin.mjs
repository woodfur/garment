/**
 * Generates ONLY the male mannequin character.
 * Run: node scripts/generate-male-mannequin.mjs
 * Preview only: node scripts/generate-male-mannequin.mjs --preview
 *
 * Reads credentials from .env.local automatically.
 */

import { createClient } from "@supabase/supabase-js";
import Replicate from "replicate";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, "..", ".env.local");

const envRaw = fs.readFileSync(ENV_PATH, "utf8");
const env = Object.fromEntries(
  envRaw.split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const REPLICATE_API_KEY = env.REPLICATE_API_KEY || env.REPLICATE_API_TOKEN;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !REPLICATE_API_KEY) {
  console.error("❌ Missing required env vars in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const replicate = new Replicate({ auth: REPLICATE_API_KEY });
const CHARACTER_GEN_MODEL = "black-forest-labs/flux-dev";
const PREVIEW_ONLY = process.argv.includes("--preview");
const PREVIEW_OUTPUT_PATH = "/private/tmp/male-character-candidate.png";

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function main() {
  console.log("🚀 Generating male mannequin character...\n");

  const output = await replicate.run(CHARACTER_GEN_MODEL, {
    input: {
      prompt: "Highly realistic, tack-sharp, full-body white studio clothing-catalogue photograph of an adult Black African man church uniform model standing upright and facing directly toward the camera, warm friendly smile, polished grooming, short neat hair, clean-shaven or neatly trimmed beard, wearing a plain light neutral grey modest church-service base outfit as a clean virtual try-on base, short-sleeve collared shirt, tailored trousers, simple black belt, glossy black closed-toe dress shoes, hands gently clasped together in front of his waist, entire body visible from top of head to bottom of shoes with generous white space, seamless pure white studio background, soft even professional e-commerce lighting, subtle realistic shadow beneath feet, natural skin texture, accurate fabric detail, deep focus, sharp focus on face, hands, shirt, trousers and shoes, realistic proportions, centered symmetrical composition, portrait orientation, no blur, no shallow depth of field, no tight fit, no cropped feet, no text, no logo, no watermark",
      aspect_ratio: "3:4",
      num_outputs: 1,
      num_inference_steps: 35,
      guidance: 3.5,
      output_format: "png",
      go_fast: false,
    },
  });

  const fileOutput = Array.isArray(output) ? output[0] : output;
  if (!fileOutput) throw new Error("No output from Replicate");

  const imageUrl = typeof fileOutput.url === "function" ? fileOutput.url().href : String(fileOutput);
  console.log(`✅ Generated: ${imageUrl}`);

  console.log("📥 Reading image stream...");
  let buffer;
  if (typeof fileOutput[Symbol.asyncIterator] === "function") {
    buffer = await streamToBuffer(fileOutput);
  } else {
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    buffer = Buffer.from(await res.arrayBuffer());
  }
  console.log(`   ${Math.round(buffer.length / 1024)} KB downloaded`);

  if (PREVIEW_ONLY) {
    fs.writeFileSync(PREVIEW_OUTPUT_PATH, buffer);
    console.log(`\n👀 Preview saved: ${PREVIEW_OUTPUT_PATH}`);
    console.log("No Supabase upload or .env.local changes were made.");
    return;
  }

  console.log("📤 Uploading to Supabase...");
  const { error } = await supabase.storage
    .from("mannequins")
    .upload("male-character.png", buffer, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Upload failed: ${error.message}`);

  const { data: { publicUrl: maleUrl } } = supabase.storage.from("mannequins").getPublicUrl("male-character.png");
  console.log(`✅ Uploaded: ${maleUrl}`);

  const femaleUrl = env.NEXT_PUBLIC_MANNEQUIN_FEMALE_URL ||
    `${SUPABASE_URL}/storage/v1/object/public/mannequins/female-character.png`;

  let content = fs.readFileSync(ENV_PATH, "utf8");
  content = content.split("\n").filter(l => !l.startsWith("NEXT_PUBLIC_MANNEQUIN_")).join("\n");
  if (!content.endsWith("\n")) content += "\n";
  content += `NEXT_PUBLIC_MANNEQUIN_MALE_URL=${maleUrl}\n`;
  content += `NEXT_PUBLIC_MANNEQUIN_FEMALE_URL=${femaleUrl}\n`;
  fs.writeFileSync(ENV_PATH, content);

  console.log("\n🎉 .env.local updated!");
  console.log(`   NEXT_PUBLIC_MANNEQUIN_MALE_URL=${maleUrl}`);
  console.log(`   NEXT_PUBLIC_MANNEQUIN_FEMALE_URL=${femaleUrl}`);
  console.log("\n⚠️  Restart the dev server to pick up the new env vars.");
}

main().catch(err => { console.error("❌", err.message); process.exit(1); });
