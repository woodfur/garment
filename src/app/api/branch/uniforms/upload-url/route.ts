import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";

/**
 * Generates a signed upload URL for uploading uniform images directly from the client
 * to Supabase storage, keeping credentials server-side.
 */
export async function POST(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;

  try {
    const { path, contentType } = await request.json();
    if (!path || typeof path !== "string") {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Create a signed upload URL (60 second expiry)
    const { data, error } = await admin.storage
      .from("uniforms")
      .createSignedUploadUrl(path);

    if (error || !data) {
      console.error("[upload-url]", error);
      return NextResponse.json({ error: "Failed to create upload URL" }, { status: 500 });
    }

    // Public URL for the uploaded file
    const { data: { publicUrl } } = admin.storage.from("uniforms").getPublicUrl(path);

    return NextResponse.json({
      uploadUrl: data.signedUrl,
      token: data.token,
      publicUrl,
    });
  } catch (err) {
    console.error("[POST /api/branch/uniforms/upload-url]", err);
    return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
  }
}
