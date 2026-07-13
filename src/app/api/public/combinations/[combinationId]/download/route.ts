import { NextResponse } from "next/server";
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
type BranchRow = { id: string };
type ScheduleIdRow = { id: string };

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
      "Cache-Control": "public, max-age=300",
    },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ combinationId: string }> }
) {
  const { combinationId } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code")?.trim();
  const gender = parseDownloadGender(url.searchParams.get("gender"));

  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  if (!gender) {
    return NextResponse.json({ error: "gender must be male or female" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: branch } = await admin
    .from("branches")
    .select("id")
    .eq("view_code", code)
    .single();

  const branchRow = branch as BranchRow | null;
  if (!branchRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: combo, error: comboError } = await admin
    .from("combinations")
    .select("id, branch_id, name, preview_status, male_composite_url, female_composite_url, male_gif_url, female_gif_url")
    .eq("id", combinationId)
    .eq("branch_id", branchRow.id)
    .single();

  if (comboError || !combo) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const today = new Date().toISOString().split("T")[0];
  const { data: schedules } = await admin
    .from("schedules")
    .select("id")
    .eq("branch_id", branchRow.id)
    .gte("service_date", today);

  const scheduleIds = ((schedules ?? []) as ScheduleIdRow[]).map((schedule) => schedule.id);
  if (scheduleIds.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: assignment } = await admin
    .from("schedule_assignments")
    .select("id")
    .eq("combination_id", combinationId)
    .in("schedule_id", scheduleIds)
    .limit(1)
    .maybeSingle();

  if (!assignment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return downloadRenderedAsset(combo as CombinationDownloadRow, gender);
}
