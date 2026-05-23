import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { generateCharacterImage } from "@/lib/replicate";
import type { Gender } from "@/types/database";

export async function POST(req: Request) {
  // Restrict to super_admin only
  const result = await requireSuperAdmin();
  if (result instanceof NextResponse) return result;

  try {
    const body = (await req.json()) as { gender?: string };
    const genders: Gender[] =
      body.gender === "male"
        ? ["male"]
        : body.gender === "female"
          ? ["female"]
          : ["male", "female"];

    const results: Record<string, string> = {};
    const admin = createAdminClient();

    for (const gender of genders) {
      let imageUrl: string;
      try {
        imageUrl = await generateCharacterImage(gender);
      } catch (genErr) {
        console.error(`[generate-mannequins] Generation failed for ${gender}:`, genErr);
        return NextResponse.json(
          { error: `Failed to generate ${gender} character. The AI model may have timed out — try again or check Replicate logs.` },
          { status: 502 }
        );
      }

      // Fetch image and upload to mannequins bucket
      const res = await fetch(imageUrl);
      if (!res.ok) {
        return NextResponse.json({ error: `Failed to fetch generated image for ${gender}` }, { status: 502 });
      }
      const blob = await res.arrayBuffer();
      const path = `${gender}-character.png`;
      const { error } = await admin.storage
        .from("mannequins")
        .upload(path, blob, { contentType: "image/png", upsert: true });
      if (error) {
        return NextResponse.json(
          { error: `Failed to upload ${gender} character: ${error.message}` },
          { status: 500 }
        );
      }
      const { data: { publicUrl } } = admin.storage.from("mannequins").getPublicUrl(path);
      results[gender] = publicUrl;
    }

    return NextResponse.json({
      message: "Characters generated. Set these as env vars:",
      urls: results,
      env_vars: Object.entries(results)
        .map(([g, u]) => `NEXT_PUBLIC_MANNEQUIN_${g.toUpperCase()}_URL=${u}`)
        .join("\n"),
    });
  } catch (err) {
    console.error("[POST /api/admin/generate-mannequins]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
