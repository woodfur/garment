import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";

type ScopedRow = { department_ids: string[] | null; all_departments: boolean };
type ScopedRowsResult = { data: ScopedRow[] | null; error: unknown };

/**
 * Count shared rows per department.
 *
 * An all-departments row counts toward every department; its explicit list is skipped so
 * it is not counted twice for the departments it also names.
 */
function countByDepartment(rows: ScopedRow[] | null) {
  let sharedByAll = 0;
  const explicit = new Map<string, number>();

  for (const row of rows ?? []) {
    if (row.all_departments) {
      sharedByAll += 1;
      continue;
    }
    for (const id of row.department_ids ?? []) {
      explicit.set(id, (explicit.get(id) ?? 0) + 1);
    }
  }

  return {
    forDepartment: (departmentId: string) => (explicit.get(departmentId) ?? 0) + sharedByAll,
  };
}

export async function GET() {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  try {
    const admin = createAdminClient();

    // Neither pieces nor looks are embeddable here any more: both are linked by a
    // department_ids array, and migrations 005/006 dropped the department_id foreign keys
    // PostgREST used to resolve `uniforms(count)` / `combinations(count)`. Attempting
    // either embed makes the whole query fail, which blanks the department list app-wide.
    const [deptRes, piecesRes, looksRes, membershipsRes] = await Promise.all([
      (admin as any)
        .from("departments")
        .select("id, name, description, branch_id, created_at")
        .eq("branch_id", auth.branchId)
        .order("created_at", { ascending: true }),
      admin
        .from("uniforms")
        .select("department_ids, all_departments")
        .eq("branch_id", auth.branchId),
      admin
        .from("combinations")
        .select("department_ids, all_departments")
        .eq("branch_id", auth.branchId),
      (admin as any)
        .from("department_memberships")
        .select("department_id")
        .eq("branch_id", auth.branchId),
    ]) as [
      {
        data: Array<{
          id: string; name: string; description: string | null;
          branch_id: string; created_at: string;
        }> | null;
        error: unknown;
      },
      ScopedRowsResult,
      ScopedRowsResult,
      { data: Array<{ department_id: string }> | null; error: unknown },
    ];

    if (deptRes.error) throw deptRes.error;
    if (piecesRes.error) throw piecesRes.error;
    if (looksRes.error) throw looksRes.error;
    if (membershipsRes.error) throw membershipsRes.error;

    const pieceCounts = countByDepartment(piecesRes.data);
    const lookCounts = countByDepartment(looksRes.data);
    const memberCounts = new Map<string, number>();
    for (const membership of membershipsRes.data ?? []) {
      memberCounts.set(membership.department_id, (memberCounts.get(membership.department_id) ?? 0) + 1);
    }

    const departments = (deptRes.data ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      branch_id: d.branch_id,
      created_at: d.created_at,
      uniform_count: pieceCounts.forDepartment(d.id),
      combination_count: lookCounts.forDepartment(d.id),
      member_count: memberCounts.get(d.id) ?? 0,
    }));

    return NextResponse.json(departments);
  } catch (err) {
    console.error("[GET /api/branch/departments]", err);
    return NextResponse.json({ error: "Failed to fetch departments" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  try {
    const body = await request.json();
    const name = (body.name ?? "").trim();
    const description = (body.description ?? "").trim() || null;

    if (!name || name.length > 100) {
      return NextResponse.json(
        { error: "Department name must be between 1 and 100 characters" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data, error } = await (admin as any)
      .from("departments")
      .insert({ name, description, branch_id: auth.branchId })
      .select()
      .single() as { data: unknown; error: { code?: string; message: string } | null };

    if (error) {
      // Unique constraint violation — duplicate name in this branch
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `A department named "${name}" already exists` },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[POST /api/branch/departments]", err);
    return NextResponse.json({ error: "Failed to create department" }, { status: 500 });
  }
}
