import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { revalidateTag } from "next/cache";

export async function GET(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  try {
    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get("department_id");
    const includeArchived = searchParams.get("include_archived") === "true";

    const admin = createAdminClient();
    let query = (admin as any)
      .from("uniforms")
      .select("id, name, category, department_id, image_url, raw_image_url, storage_path, description, is_archived, bg_removed, created_at, departments(name)")
      .eq("branch_id", auth.branchId)
      .order("created_at", { ascending: false });

    if (departmentId) query = query.eq("department_id", departmentId);
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
    const { name, category, department_id, description, storage_path, image_url, raw_image_url, bg_removed } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!category?.trim()) return NextResponse.json({ error: "Category is required" }, { status: 400 });
    if (!department_id) return NextResponse.json({ error: "Department is required" }, { status: 400 });

    // Verify department belongs to this branch
    const admin = createAdminClient();
    const { data: dept } = await (admin as any)
      .from("departments")
      .select("id")
      .eq("id", department_id)
      .eq("branch_id", auth.branchId)
      .single();
    if (!dept) return NextResponse.json({ error: "Invalid department" }, { status: 400 });

    const { data, error } = await (admin as any)
      .from("uniforms")
      .insert({
        name: name.trim(),
        category,
        department_id,
        description: description?.trim() || null,
        storage_path: storage_path || null,
        image_url: image_url || null,
        raw_image_url: raw_image_url || null,
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
