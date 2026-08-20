import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { revalidateTag } from "next/cache";
import { isGender, isUuid, validateDepartmentScope } from "@/lib/scope";

/**
 * Department names are resolved separately, not via a `departments(name)` embed: migration
 * 006 dropped the combinations.department_id foreign key that PostgREST used to resolve
 * that embed, and a look can now belong to several departments anyway.
 */
async function attachDepartmentNames(
  admin: ReturnType<typeof createAdminClient>,
  branchId: string,
  rows: Array<{ department_ids?: string[] | null; all_departments?: boolean }>
) {
  const { data } = await admin.from("departments").select("id, name").eq("branch_id", branchId);
  const names = new Map((data ?? []).map((d: { id: string; name: string }) => [d.id, d.name]));

  return rows.map((row) => ({
    ...row,
    department_names: row.all_departments
      ? (data ?? []).map((d: { name: string }) => d.name)
      : (row.department_ids ?? []).map((id) => names.get(id)).filter(Boolean),
  }));
}

export async function GET(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  try {
    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("department_id");
    const gender = searchParams.get("gender");

    const admin = createAdminClient();
    let query = (admin as any)
      .from("combinations")
      .select("id, name, description, department_ids, all_departments, gender, canvas_data, preview_url, preview_status, male_composite_url, female_composite_url, male_gif_url, female_gif_url, created_by, created_at")
      .eq("branch_id", auth.branchId)
      .order("created_at", { ascending: false });

    if (departmentId) {
      // Shared looks match any department they list, plus all-departments looks.
      // UUID-validated before interpolation — see the same guard in the uniforms route.
      if (!isUuid(departmentId)) {
        return NextResponse.json({ error: "Invalid department id" }, { status: 400 });
      }
      query = query.or(`all_departments.eq.true,department_ids.cs.{${departmentId}}`);
    }
    if (isGender(gender)) query = query.eq("gender", gender);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(await attachDepartmentNames(admin, auth.branchId, data ?? []));
  } catch (err) {
    console.error("[GET /api/branch/combinations]", err);
    return NextResponse.json({ error: "Failed to fetch combinations" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  try {
    const body = await request.json();
    const { name, description, gender, canvas_data, preview_url, items } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!isGender(gender)) return NextResponse.json({ error: "Gender is required" }, { status: 400 });

    let scope;
    try {
      scope = validateDepartmentScope(body);
    } catch (scopeErr) {
      return NextResponse.json({ error: (scopeErr as Error).message }, { status: 400 });
    }

    const admin = createAdminClient();
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

    // Insert combination
    const { data: combination, error: comboErr } = await (admin as any)
      .from("combinations")
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        department_ids: scope.department_ids,
        all_departments: scope.all_departments,
        gender,
        canvas_data: canvas_data || null,
        preview_url: preview_url || null,
        branch_id: auth.branchId,
        created_by: auth.userId,
      })
      .select()
      .single();

    if (comboErr) throw comboErr;

    // Insert combination_items if provided
    if (Array.isArray(items) && items.length > 0) {
      const rows = items.map((item: {
        uniform_id: string; layer_order: number;
        x?: number; y?: number; scale_x?: number; scale_y?: number; rotation?: number;
      }) => ({
        combination_id: combination.id,
        uniform_id: item.uniform_id,
        layer_order: item.layer_order,
        x: item.x ?? 0,
        y: item.y ?? 0,
        scale_x: item.scale_x ?? 1,
        scale_y: item.scale_y ?? 1,
        rotation: item.rotation ?? 0,
      }));
      await (admin as any).from("combination_items").insert(rows);
    }

    // Invalidate dashboard lists cache — combination count changes
    revalidateTag(`dashboard-lists-${auth.branchId}`, "default");
    revalidateTag(`dashboard-stats-${auth.branchId}`, "default");

    return NextResponse.json(combination, { status: 201 });
  } catch (err) {
    console.error("[POST /api/branch/combinations]", err);
    return NextResponse.json({ error: "Failed to create combination" }, { status: 500 });
  }
}
