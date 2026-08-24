import { NextResponse } from "next/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export async function POST(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;

  const body = await request.json().catch(() => ({}));
  const path = typeof body.path === "string" ? body.path : "";
  const contentType = typeof body.contentType === "string" ? body.contentType : "";

  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }
  if (contentType && !ALLOWED_TYPES.includes(contentType)) {
    return NextResponse.json(
      { error: `Unsupported file type. Allowed: ${ALLOWED_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("inventory-items")
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error("[inventory upload-url]", error);
    return NextResponse.json({ error: "Failed to create upload URL" }, { status: 500 });
  }

  const { data: { publicUrl } } = admin.storage.from("inventory-items").getPublicUrl(path);

  return NextResponse.json({
    uploadUrl: data.signedUrl,
    token: data.token,
    publicUrl,
  });
}
