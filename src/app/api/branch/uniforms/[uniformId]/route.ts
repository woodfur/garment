import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { revalidateTag } from "next/cache";

type Params = { params: Promise<{ uniformId: string }> };

async function verifyUniform(uniformId: string, branchId: string) {
  const admin = createAdminClient();
  const { data } = await (admin as any)
    .from("uniforms")
    .select("id, branch_id, storage_path")
    .eq("id", uniformId)
    .single() as { data: { id: string; branch_id: string; storage_path: string | null } | null };
  return data?.branch_id === branchId ? data : null;
}

export async function PATCH(request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const { uniformId } = await params;
  const uniform = await verifyUniform(uniformId, auth.branchId);
  if (!uniform) return NextResponse.json({ error: "Uniform not found" }, { status: 404 });

  try {
    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.category !== undefined) updates.category = body.category;
    if (body.description !== undefined) updates.description = body.description?.trim() || null;
    if (body.department_id !== undefined) updates.department_id = body.department_id;
    if (body.image_url !== undefined) updates.image_url = body.image_url;
    if (body.bg_removed !== undefined) updates.bg_removed = body.bg_removed;

    const admin = createAdminClient();
    const { data, error } = await (admin as any)
      .from("uniforms")
      .update(updates)
      .eq("id", uniformId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error("[PATCH /api/branch/uniforms/[id]]", err);
    return NextResponse.json({ error: "Failed to update uniform" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const { uniformId } = await params;
  const uniform = await verifyUniform(uniformId, auth.branchId);
  if (!uniform) return NextResponse.json({ error: "Uniform not found" }, { status: 404 });

  try {
    const admin = createAdminClient();

    // Delete storage files if they exist
    if (uniform.storage_path) {
      await admin.storage.from("uniforms").remove([uniform.storage_path, `bg-removed/${uniform.storage_path}`]);
    }

    const { error } = await (admin as any).from("uniforms").delete().eq("id", uniformId);
    if (error) throw error;

    revalidateTag(`dashboard-stats-${auth.branchId}`, "default");
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/branch/uniforms/[id]]", err);
    return NextResponse.json({ error: "Failed to delete uniform" }, { status: 500 });
  }
}
