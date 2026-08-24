import { NextResponse } from "next/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ itemId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;
  const { itemId } = await params;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  const categoryId = typeof body.category_id === "string" ? body.category_id : undefined;
  const isArchived = typeof body.is_archived === "boolean" ? body.is_archived : undefined;

  if (name !== undefined && (!name || name.length > 120)) {
    return NextResponse.json({ error: "Item name must be between 1 and 120 characters" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (categoryId) {
    const { data: category } = await (admin as any)
      .from("inventory_categories")
      .select("id")
      .eq("id", categoryId)
      .eq("branch_id", auth.branchId)
      .single() as { data: { id: string } | null };

    if (!category) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (categoryId !== undefined) updates.category_id = categoryId;
  if (isArchived !== undefined) updates.is_archived = isArchived;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  const { data, error } = await (admin as any)
    .from("inventory_accessories")
    .update(updates)
    .eq("id", itemId)
    .eq("branch_id", auth.branchId)
    .select("id, branch_id, category_id, name, quantity, image_url, raw_image_url, storage_path, bg_removed, is_archived, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(_request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;
  const { itemId } = await params;

  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from("inventory_accessories")
    .update({ is_archived: true })
    .eq("id", itemId)
    .eq("branch_id", auth.branchId)
    .select("id")
    .single();

  if (error || !data) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
