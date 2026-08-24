import { NextResponse } from "next/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ categoryId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;
  const { categoryId } = await params;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name || name.length > 80) {
    return NextResponse.json(
      { error: "Category name must be between 1 and 80 characters" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from("inventory_categories")
    .update({ name })
    .eq("id", categoryId)
    .eq("branch_id", auth.branchId)
    .select("id, branch_id, name, created_at")
    .single();

  if (error?.code === "23505") {
    return NextResponse.json({ error: `A category named "${name}" already exists` }, { status: 409 });
  }
  if (error) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;
  const { categoryId } = await params;
  const admin = createAdminClient();

  const { count } = await (admin as any)
    .from("inventory_accessories")
    .select("*", { count: "exact", head: true })
    .eq("category_id", categoryId)
    .eq("branch_id", auth.branchId);

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: "Category has inventory items" }, { status: 409 });
  }

  const { error } = await (admin as any)
    .from("inventory_categories")
    .delete()
    .eq("id", categoryId)
    .eq("branch_id", auth.branchId);

  if (error) {
    console.error("[DELETE /api/branch/inventory/categories/[categoryId]]", error);
    return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
