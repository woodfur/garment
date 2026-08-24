import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireBranchLeader } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";

const REPLICATE_REMOVE_BG_VERSION = "95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1";

export async function POST(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  try {
    const { itemId, storagePath } = await request.json() as {
      itemId?: string;
      storagePath?: string;
    };

    if (!itemId || !storagePath) {
      return NextResponse.json({ error: "itemId and storagePath are required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const db = admin as any;
    const { data: item } = await db
      .from("inventory_accessories")
      .select("id, branch_id, image_url, bg_removed")
      .eq("id", itemId)
      .single() as { data: { id: string; branch_id: string; image_url: string | null; bg_removed: boolean } | null };

    if (!item || item.branch_id !== auth.branchId) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    if (item.bg_removed) {
      return NextResponse.json({ message: "Already done", image_url: item.image_url });
    }

    const apiKey = process.env.REPLICATE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Replicate API key not configured" }, { status: 503 });
    }

    const { data: { publicUrl: rawPublicUrl } } = admin.storage
      .from("inventory-items")
      .getPublicUrl(storagePath);

    const response = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        version: REPLICATE_REMOVE_BG_VERSION,
        input: { image: rawPublicUrl },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[inventory remove-bg] Replicate error:", errText);
      return NextResponse.json({ error: "Background removal service failed" }, { status: 502 });
    }

    const prediction = await response.json() as { status: string; output?: string; error?: string };
    if (prediction.status === "failed" || prediction.error) {
      return NextResponse.json({ error: prediction.error ?? "Removal failed" }, { status: 500 });
    }
    if (!prediction.output) {
      return NextResponse.json({ error: "No output from removal model" }, { status: 500 });
    }

    const imgRes = await fetch(prediction.output);
    if (!imgRes.ok) {
      return NextResponse.json({ error: "Failed to download processed image" }, { status: 502 });
    }

    const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
    const processedImage = await sharp(imgBuffer)
      .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 88, effort: 4 })
      .toBuffer();

    const bgPath = `bg-removed/${storagePath.replace(/\.[^.]+$/, ".webp")}`;
    const { error: uploadError } = await admin.storage
      .from("inventory-items")
      .upload(bgPath, processedImage, {
        contentType: "image/webp",
        upsert: true,
      });

    if (uploadError) {
      console.error("[inventory remove-bg] Upload error:", uploadError);
      return NextResponse.json({ error: "Failed to store processed image" }, { status: 500 });
    }

    const { data: { publicUrl: bgPublicUrl } } = admin.storage
      .from("inventory-items")
      .getPublicUrl(bgPath);

    await db
      .from("inventory_accessories")
      .update({ image_url: bgPublicUrl, bg_removed: true })
      .eq("id", itemId);

    return NextResponse.json({
      success: true,
      image_url: bgPublicUrl,
      bg_removed: true,
    });
  } catch (err) {
    console.error("[POST /api/branch/inventory/items/remove-bg]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
