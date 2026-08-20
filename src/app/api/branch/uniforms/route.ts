import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { revalidateTag } from "next/cache";
import { isGender, isUuid, validatePieceScope } from "@/lib/scope";

const SCOPE_COLUMNS = "department_ids, all_departments, genders";

/**
 * Confirm every department id belongs to the caller's branch.
 *
 * Returns the ids that did not match so the caller can reject the request — a piece must
 * never be scoped to another branch's department.
 */
async function departmentsOutsideBranch(
  admin: ReturnType<typeof createAdminClient>,
  departmentIds: string[],
  branchId: string
): Promise<string[]> {
  if (departmentIds.length === 0) return [];

  const { data } = await admin
    .from("departments")
    .select("id")
    .eq("branch_id", branchId)
    .in("id", departmentIds);

  const found = new Set((data ?? []).map((row: { id: string }) => row.id));
  return departmentIds.filter((id) => !found.has(id));
}

export async function GET(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  try {
    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("department_id");
    const gender = searchParams.get("gender");
    const includeArchived = searchParams.get("include_archived") === "true";

    const admin = createAdminClient();
    let query = (admin as any)
      .from("uniforms")
      .select(`id, name, category, ${SCOPE_COLUMNS}, image_url, raw_image_url, storage_path, description, is_archived, bg_removed, color, color_label, created_at`)
      .eq("branch_id", auth.branchId)
      .order("created_at", { ascending: false });

    if (departmentId) {
      // A piece matches when it lists the department OR is marked for all departments.
      // departmentId is interpolated into an .or() filter string, so it is UUID-validated
      // first — a past bug in this codebase came from interpolating unvalidated input here.
      if (!isUuid(departmentId)) {
        return NextResponse.json({ error: "Invalid department id" }, { status: 400 });
      }
      query = query.or(`all_departments.eq.true,department_ids.cs.{${departmentId}}`);
    }
    if (isGender(gender)) query = query.overlaps("genders", [gender]);
    if (!includeArchived) query = query.or("is_archived.eq.false,is_archived.is.null");

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data ?? []);
  } catch (err) {
    console.error("[GET /api/branch/uniforms]", err);
    return NextResponse.json({ error: "Failed to fetch uniforms" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  try {
    const body = await request.json();
    const { name, category, description, storage_path, image_url, raw_image_url, bg_removed, color, color_label } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!category?.trim()) return NextResponse.json({ error: "Category is required" }, { status: 400 });

    let scope;
    try {
      scope = validatePieceScope(body);
    } catch (scopeErr) {
      return NextResponse.json({ error: (scopeErr as Error).message }, { status: 400 });
    }

    // A piece is either a photo or a colour swatch — require at least one.
    const hexColor = typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color) ? color : null;
    if (!image_url && !hexColor) {
      return NextResponse.json({ error: "Provide either an image or a colour" }, { status: 400 });
    }

    const admin = createAdminClient();
    const foreign = await departmentsOutsideBranch(admin, scope.department_ids, auth.branchId);
    if (foreign.length > 0) {
      return NextResponse.json({ error: "One or more departments are invalid" }, { status: 400 });
    }

    const { data, error } = await (admin as any)
      .from("uniforms")
      .insert({
        name: name.trim(),
        category,
        department_ids: scope.department_ids,
        all_departments: scope.all_departments,
        genders: scope.genders,
        description: description?.trim() || null,
        storage_path: storage_path || null,
        image_url: image_url || null,
        raw_image_url: raw_image_url || null,
        color: hexColor,
        color_label: color_label?.trim() || null,
        branch_id: auth.branchId,
        is_archived: false,
        bg_removed: bg_removed === true,
      })
      .select()
      .single();

    if (error) throw error;

    // Invalidate dashboard stat cache — uniform count changes
    revalidateTag(`dashboard-stats-${auth.branchId}`, "default");

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[POST /api/branch/uniforms]", err);
    return NextResponse.json({ error: "Failed to create uniform" }, { status: 500 });
  }
}
