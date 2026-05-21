import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";

export async function POST(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;

  try {
    const { filename } = await request.json();
    if (!filename) return NextResponse.json({ error: "filename required" }, { status: 400 });

    const path = `previews/${Date.now()}-${filename}`;
    const admin = createAdminClient();

    const { data, error } = await admin.storage
      .from("combination-previews")
      .createSignedUploadUrl(path);

    if (error || !data) {
      return NextResponse.json({ error: "Failed to create upload URL" }, { status: 500 });
    }

    const { data: { publicUrl } } = admin.storage.from("combination-previews").getPublicUrl(path);

    return NextResponse.json({ uploadUrl: data.signedUrl, publicUrl });
  } catch (err) {
    console.error("[POST /api/branch/combinations/upload-preview]", err);
    return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
  }
}
