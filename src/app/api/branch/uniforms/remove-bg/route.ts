import { NextResponse } from "next/server";
import sharp from "sharp";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";

const REPLICATE_REMOVE_BG_VERSION = "95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1";

/**
 * POST /api/branch/uniforms/remove-bg
 *
 * Server-side background removal via Replicate rembg model.
 * Accepts { uniformId, storagePath } and:
 *  1. Fetches the raw image from Supabase storage
 *  2. Sends to Replicate rembg for fast server-side removal (~3-5s)
 *  3. Converts the result to a compact transparent WebP and uploads to uniforms/bg-removed/...
 *  4. Updates the uniforms row with the new image_url + bg_removed = true
 */
export async function POST(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  try {
    const { uniformId, storagePath } = await request.json() as {
      uniformId: string;
      storagePath: string;
    };

    if (!uniformId || !storagePath) {
      return NextResponse.json({ error: "uniformId and storagePath are required" }, { status: 400 });
    }

    const admin = createAdminClient();
    // Database types lag the live Supabase schema in this repo; keep this route aligned with the existing admin-client pattern.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = admin as any;

    // Verify uniform belongs to this branch
    const { data: uniform } = await db
      .from("uniforms")
      .select("id, branch_id, raw_image_url, image_url, bg_removed")
      .eq("id", uniformId)
      .single() as { data: { id: string; branch_id: string; raw_image_url: string | null; image_url: string | null; bg_removed: boolean } | null };

    if (!uniform || uniform.branch_id !== auth.branchId) {
      return NextResponse.json({ error: "Uniform not found" }, { status: 404 });
    }

    if (uniform.bg_removed) {
      return NextResponse.json({ message: "Already done", image_url: uniform.image_url });
    }

    const apiKey = process.env.REPLICATE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Replicate API key not configured" }, { status: 503 });
    }

    // Get the public URL of the raw image to send to Replicate
    const { data: { publicUrl: rawPublicUrl } } = admin.storage
      .from("uniforms")
      .getPublicUrl(storagePath);

    // Call Replicate rembg — synchronous (short model, usually <5s)
    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Prefer": "wait", // wait for result synchronously (up to 60s)
      },
      body: JSON.stringify({
        version: REPLICATE_REMOVE_BG_VERSION,
        input: { image: rawPublicUrl },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[remove-bg] Replicate error:", errText);
      return NextResponse.json({ error: "Background removal service failed" }, { status: 502 });
    }

    const prediction = await response.json() as {
      status: string;
      output?: string;
      error?: string;
    };

    if (prediction.status === "failed" || prediction.error) {
      return NextResponse.json({ error: prediction.error ?? "Removal failed" }, { status: 500 });
    }

    const outputUrl = prediction.output;
    if (!outputUrl) {
      return NextResponse.json({ error: "No output from removal model" }, { status: 500 });
    }

    // Download the resulting PNG from Replicate
    const imgRes = await fetch(outputUrl);
    if (!imgRes.ok) {
      return NextResponse.json({ error: "Failed to download processed image" }, { status: 502 });
    }
    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const processedImage = await sharp(imgBuffer)
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88, effort: 4 })
      .toBuffer();

    // Upload to uniforms/bg-removed/... in Supabase storage
    const bgPath = `bg-removed/${storagePath.replace(/\.[^.]+$/, ".webp")}`;
    const { error: uploadError } = await admin.storage
      .from("uniforms")
      .upload(bgPath, processedImage, {
        contentType: "image/webp",
        upsert: true,
      });

    if (uploadError) {
      console.error("[remove-bg] Upload error:", uploadError);
      return NextResponse.json({ error: "Failed to store processed image" }, { status: 500 });
    }

    const { data: { publicUrl: bgPublicUrl } } = admin.storage
      .from("uniforms")
      .getPublicUrl(bgPath);

    // Update the uniform record
    await db
      .from("uniforms")
      .update({ image_url: bgPublicUrl, bg_removed: true })
      .eq("id", uniformId);

    return NextResponse.json({
      success: true,
      image_url: bgPublicUrl,
      bg_removed: true,
    });
  } catch (err) {
    console.error("[POST /api/branch/uniforms/remove-bg]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
