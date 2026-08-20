import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";

type Params = { params: Promise<{ departmentId: string }> };

/** Verify the department belongs to the authenticated branch */
async function getDepartment(departmentId: string, branchId: string) {
  const admin = createAdminClient();
  const { data } = await (admin as any)
    .from("departments")
    .select("id, branch_id")
    .eq("id", departmentId)
    .single() as { data: { id: string; branch_id: string } | null };
  if (!data || data.branch_id !== branchId) return null;
  return data;
}

export async function PATCH(request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const { departmentId } = await params;
  const dept = await getDepartment(departmentId, auth.branchId);
  if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 });

  try {
    const body = await request.json();
    const name = (body.name ?? "").trim();
    const description = body.description !== undefined
      ? (body.description ?? "").trim() || null
      : undefined;

    if (name !== undefined && (!name || name.length > 100)) {
      return NextResponse.json(
        { error: "Department name must be between 1 and 100 characters" },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (name) updates.name = name;
    if (description !== undefined) updates.description = description;

    const admin = createAdminClient();
    const { data, error } = await (admin as any)
      .from("departments")
      .update(updates)
      .eq("id", departmentId)
      .select()
      .single() as { data: unknown; error: { code?: string; message: string } | null };

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `A department named "${name}" already exists` },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("[PATCH /api/branch/departments/[id]]", err);
    return NextResponse.json({ error: "Failed to update department" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const { departmentId } = await params;
  const dept = await getDepartment(departmentId, auth.branchId);
  if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 });

  try {
    const admin = createAdminClient();

    // Pieces and looks are both shareable, so deletion detaches the department instead of
    // blocking. Anything scoped only to this department is left with none — it stops
    // appearing in builders and is flagged "No department" so it is not lost.
    for (const table of ["uniforms", "combinations"] as const) {
      const { data: scoped } = await (admin as any)
        .from(table)
        .select("id, department_ids")
        .eq("branch_id", auth.branchId)
        .contains("department_ids", [departmentId]) as {
          data: Array<{ id: string; department_ids: string[] }> | null;
        };

      await Promise.all(
        (scoped ?? []).map((row) =>
          (admin as any)
            .from(table)
            .update({ department_ids: row.department_ids.filter((id) => id !== departmentId) })
            .eq("id", row.id)
        )
      );
    }

    const { error } = await (admin as any)
      .from("departments")
      .delete()
      .eq("id", departmentId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/branch/departments/[id]]", err);
    return NextResponse.json({ error: "Failed to delete department" }, { status: 500 });
  }
}
