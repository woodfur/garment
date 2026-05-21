import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { revalidateTag } from "next/cache";

type Params = { params: Promise<{ uniformId: string }> };

export async function POST(_request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const { uniformId } = await params;

  try {
    const admin = createAdminClient();

    // Verify ownership
    const { data: uniform } = await (admin as any)
      .from("uniforms")
      .select("id, branch_id, is_archived")
      .eq("id", uniformId)
      .single() as { data: { id: string; branch_id: string; is_archived: boolean } | null };

    if (!uniform || uniform.branch_id !== auth.branchId) {
      return NextResponse.json({ error: "Uniform not found" }, { status: 404 });
    }

    const { data, error } = await (admin as any)
      .from("uniforms")
      .update({ is_archived: !uniform.is_archived })
      .eq("id", uniformId)
      .select()
      .single();

    if (error) throw error;

    // Archived uniforms are excluded from dashboard count — must revalidate
    revalidateTag(`dashboard-stats-${auth.branchId}`, "default");

    return NextResponse.json(data);
  } catch (err) {
    console.error("[POST /api/branch/uniforms/[id]/archive]", err);
    return NextResponse.json({ error: "Failed to toggle archive" }, { status: 500 });
  }
}
