import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { revalidateTag } from "next/cache";
import { validatePieceScope } from "@/lib/scope";

type Params = { params: Promise<{ uniformId: string }> };

async function verifyUniform(uniformId: string, branchId: string) {
  const admin = createAdminClient();
  // Database types lag the live Supabase schema in this repo; keep this route aligned with the existing admin-client pattern.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (admin as any)
    .from("uniforms")
    .select("id, branch_id, storage_path, image_url")
    .eq("id", uniformId)
    .single() as { data: { id: string; branch_id: string; storage_path: string | null; image_url: string | null } | null };
  return data?.branch_id === branchId ? data : null;
}

function storagePathFromPublicUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = "/storage/v1/object/public/uniforms/";
  const markerIndex = url.indexOf(marker);
  return markerIndex === -1 ? null : decodeURIComponent(url.slice(markerIndex + marker.length));
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
    if (body.image_url !== undefined) updates.image_url = body.image_url;
    if (body.bg_removed !== undefined) updates.bg_removed = body.bg_removed;

    const admin = createAdminClient();

    // Scope fields move together — a partial update could leave a piece with departments
    // but no genders, so all three are validated as one unit whenever any is present.
    const touchesScope =
      body.department_ids !== undefined ||
      body.all_departments !== undefined ||
      body.genders !== undefined;

    if (touchesScope) {
      let scope;
      try {
        scope = validatePieceScope(body);
      } catch (scopeErr) {
        return NextResponse.json({ error: (scopeErr as Error).message }, { status: 400 });
      }

      if (scope.department_ids.length > 0) {
        const { data: valid } = await admin
          .from("departments")
          .select("id")
          .eq("branch_id", auth.branchId)
          .in("id", scope.department_ids);

        if ((valid ?? []).length !== scope.department_ids.length) {
          return NextResponse.json({ error: "One or more departments are invalid" }, { status: 400 });
        }
      }

      updates.department_ids = scope.department_ids;
      updates.all_departments = scope.all_departments;
      updates.genders = scope.genders;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      const pathsToRemove = new Set<string>([
        uniform.storage_path,
        `bg-removed/${uniform.storage_path}`,
        `bg-removed/${uniform.storage_path.replace(/\.[^.]+$/, ".png")}`,
        `bg-removed/${uniform.storage_path.replace(/\.[^.]+$/, ".webp")}`,
      ]);
      const processedPath = storagePathFromPublicUrl(uniform.image_url);
      if (processedPath) pathsToRemove.add(processedPath);
      await admin.storage.from("uniforms").remove([...pathsToRemove]);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any).from("uniforms").delete().eq("id", uniformId);
    if (error) throw error;

    revalidateTag(`dashboard-stats-${auth.branchId}`, "default");
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/branch/uniforms/[id]]", err);
    return NextResponse.json({ error: "Failed to delete uniform" }, { status: 500 });
  }
}
