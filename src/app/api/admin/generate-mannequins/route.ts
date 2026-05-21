import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { generateCharacterImage } from "@/lib/replicate";
import type { Gender } from "@/types/database";

export async function POST(req: Request) {
  // Restrict to super_admin only
  const auth = await getAuthContext();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (auth.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
    const imageUrl = await generateCharacterImage(gender);
    // Fetch image and upload to mannequins bucket
    const res = await fetch(imageUrl);
    const blob = await res.arrayBuffer();
    const path = `${gender}-character.png`;
    const { error } = await admin.storage
      .from("mannequins")
      .upload(path, blob, { contentType: "image/png", upsert: true });
    if (error)
      throw new Error(
        `Failed to upload ${gender} character: ${error.message}`
      );
    const {
      data: { publicUrl },
    } = admin.storage.from("mannequins").getPublicUrl(path);
    results[gender] = publicUrl;
  }

  return NextResponse.json({
    message: "Characters generated. Set these as env vars:",
    urls: results,
    env_vars: Object.entries(results)
      .map(([g, u]) => `NEXT_PUBLIC_MANNEQUIN_${g.toUpperCase()}_URL=${u}`)
      .join("\n"),
  });
}
