import { NextResponse } from "next/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";
import {
  buildRenderedFilename,
  extensionFromContentType,
  getRenderedAsset,
  parseDownloadGender,
  type DownloadableRender,
} from "@/lib/render-download";

type CombinationDownloadRow = DownloadableRender & {
  id: string;
  branch_id: string;
  preview_status: string;
};

async function downloadRenderedAsset(combo: CombinationDownloadRow, gender: "male" | "female") {
  if (combo.preview_status !== "ready") {
    return NextResponse.json({ error: "Rendered preview is not ready" }, { status: 409 });
  }

  const asset = getRenderedAsset(combo, gender);
  if (!asset) {
    return NextResponse.json({ error: "Rendered image not found" }, { status: 404 });
  }

  const imageResponse = await fetch(asset.url);
  if (!imageResponse.ok) {
    return NextResponse.json({ error: "Failed to fetch rendered image" }, { status: 502 });
  }

  const contentType = imageResponse.headers.get("content-type") ?? "application/octet-stream";
  const extension = extensionFromContentType(contentType, asset.fallbackExtension);
  const filename = buildRenderedFilename({
    combinationName: combo.name,
    gender,
    extension,
  });

  return new Response(await imageResponse.arrayBuffer(), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ combinationId: string }> }
) {
  const authResult = await requireBranchLeader();
  if (authResult instanceof NextResponse) return authResult;
  const { auth } = authResult;

  const { combinationId } = await params;
  const url = new URL(req.url);
  const gender = parseDownloadGender(url.searchParams.get("gender"));
  if (!gender) {
    return NextResponse.json({ error: "gender must be male or female" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("combinations")
    .select("id, branch_id, name, preview_status, male_composite_url, female_composite_url, male_gif_url, female_gif_url")
    .eq("id", combinationId)
    .single();

  const combo = data as CombinationDownloadRow | null;
  if (error || !combo || combo.branch_id !== auth.branchId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return downloadRenderedAsset(combo, gender);
}
