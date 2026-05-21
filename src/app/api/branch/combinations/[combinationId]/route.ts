import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { revalidateTag } from "next/cache";

type Params = { params: Promise<{ combinationId: string }> };

async function verifyCombination(combinationId: string, branchId: string) {
  const admin = createAdminClient();
  const { data } = await (admin as any)
    .from("combinations")
    .select("id, branch_id, preview_url")
    .eq("id", combinationId)
    .single() as { data: { id: string; branch_id: string; preview_url: string | null } | null };
  return data?.branch_id === branchId ? data : null;
}

export async function GET(_request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const { combinationId } = await params;
  const combo = await verifyCombination(combinationId, auth.branchId);
  if (!combo) return NextResponse.json({ error: "Combination not found" }, { status: 404 });

  try {
    const admin = createAdminClient();
    const { data, error } = await (admin as any)
      .from("combinations")
      .select(`
        id, name, description, department_id, canvas_data, preview_url, created_at,
        departments(name),
        combination_items(
          id, uniform_id, layer_order, x, y, scale_x, scale_y, rotation,
          uniforms(id, name, category, image_url, bg_removed)
        )
      `)
      .eq("id", combinationId)
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error("[GET /api/branch/combinations/[id]]", err);
    return NextResponse.json({ error: "Failed to fetch combination" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const { combinationId } = await params;
  const combo = await verifyCombination(combinationId, auth.branchId);
  if (!combo) return NextResponse.json({ error: "Combination not found" }, { status: 404 });

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description?.trim() || null;
    if (body.canvas_data !== undefined) updates.canvas_data = body.canvas_data;
    if (body.preview_url !== undefined) updates.preview_url = body.preview_url;

    const admin = createAdminClient();
    const { data, error } = await (admin as any)
      .from("combinations")
      .update(updates)
      .eq("id", combinationId)
      .select()
      .single();

    if (error) throw error;
    revalidateTag(`dashboard-lists-${auth.branchId}`, "default");
    return NextResponse.json(data);
  } catch (err) {
    console.error("[PATCH /api/branch/combinations/[id]]", err);
    return NextResponse.json({ error: "Failed to update combination" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const { combinationId } = await params;
  const combo = await verifyCombination(combinationId, auth.branchId);
  if (!combo) return NextResponse.json({ error: "Combination not found" }, { status: 404 });

  try {
    const admin = createAdminClient();

    // Delete preview from storage
    if (combo.preview_url) {
      const path = combo.preview_url.split("/combination-previews/")[1];
      if (path) await admin.storage.from("combination-previews").remove([path]);
    }

    const { error } = await (admin as any).from("combinations").delete().eq("id", combinationId);
    if (error) throw error;

    revalidateTag(`dashboard-lists-${auth.branchId}`, "default");
    revalidateTag(`dashboard-stats-${auth.branchId}`, "default");
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/branch/combinations/[id]]", err);
    return NextResponse.json({ error: "Failed to delete combination" }, { status: 500 });
  }
}
