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

    const admin = createAdminClient();
    let query = (admin as any)
      .from("combinations")
      .select("id, name, description, department_id, canvas_data, preview_url, preview_status, male_gif_url, female_gif_url, created_by, created_at, departments(name)")
      .eq("branch_id", auth.branchId)
      .order("created_at", { ascending: false });

    if (departmentId) query = query.eq("department_id", departmentId);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json(data ?? []);
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
    const { name, description, department_id, canvas_data, preview_url, items } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
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

    // Insert combination
    const { data: combination, error: comboErr } = await (admin as any)
      .from("combinations")
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        department_id,
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
