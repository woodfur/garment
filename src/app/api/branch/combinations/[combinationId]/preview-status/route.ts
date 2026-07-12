import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";

// GET /api/branch/combinations/[combinationId]/preview-status
// Lightweight polling endpoint — returns only status + gif URLs
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ combinationId: string }> }
) {
  const authResult = await requireBranchLeader();
  if (authResult instanceof NextResponse) return authResult;
  const { auth } = authResult;

  const { combinationId } = await params;
  const admin = createAdminClient();
  // Cast for new columns (preview_status, *_gif_url, *_composite_url) not yet in Supabase generated types
  const db = admin as any;

  const { data, error } = await db
    .from("combinations")
    .select("id, branch_id, preview_url, preview_status, male_composite_url, female_composite_url, male_gif_url, female_gif_url")
    .eq("id", combinationId)
    .single() as { data: { id: string; branch_id: string; preview_url: string | null; preview_status: string; male_composite_url: string | null; female_composite_url: string | null; male_gif_url: string | null; female_gif_url: string | null } | null; error: { message: string } | null };

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (data.branch_id !== auth.branchId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    preview_url:          data.preview_url,
    preview_status:       data.preview_status,
    male_composite_url:   data.male_composite_url,
    female_composite_url: data.female_composite_url,
    male_gif_url:         data.male_gif_url,
    female_gif_url:       data.female_gif_url,
  });
}
