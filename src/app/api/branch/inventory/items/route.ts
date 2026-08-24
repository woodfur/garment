import { NextResponse } from "next/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { withStockSummary } from "@/lib/inventory";

type InventoryItemRow = {
  id: string;
  branch_id: string;
  category_id: string;
  name: string;
  quantity: number;
  image_url: string | null;
  raw_image_url: string | null;
  storage_path: string | null;
  bg_removed: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  category: { name: string } | null;
};

async function assignedQuantityByItem(admin: ReturnType<typeof createAdminClient>, branchId: string) {
  const { data } = await (admin as any)
    .from("inventory_assignment_items")
    .select("inventory_item_id, quantity, assignment:inventory_assignments(branch_id)")
    .eq("status", "assigned");

  const assignedByItemId = new Map<string, number>();
  for (const row of (data ?? []) as Array<{
    inventory_item_id: string;
    quantity: number;
    assignment: { branch_id: string } | null;
  }>) {
    if (row.assignment?.branch_id !== branchId) continue;
    assignedByItemId.set(row.inventory_item_id, (assignedByItemId.get(row.inventory_item_id) ?? 0) + row.quantity);
  }
  return assignedByItemId;
}

export async function GET(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const { searchParams } = new URL(request.url);
  const includeArchived = searchParams.get("include_archived") === "true";
  const admin = createAdminClient();

  let query = (admin as any)
    .from("inventory_accessories")
    .select("id, branch_id, category_id, name, quantity, image_url, raw_image_url, storage_path, bg_removed, is_archived, created_at, updated_at, category:inventory_categories(name)")
    .eq("branch_id", auth.branchId)
    .order("created_at", { ascending: false });

  if (!includeArchived) query = query.eq("is_archived", false);

  const [{ data, error }, assignedByItemId] = await Promise.all([
    query as Promise<{ data: InventoryItemRow[] | null; error: { message: string } | null }>,
    assignedQuantityByItem(admin, auth.branchId),
  ]);

  if (error) {
    console.error("[GET /api/branch/inventory/items]", error);
    return NextResponse.json({ error: "Failed to fetch inventory items" }, { status: 500 });
  }

  const rows = withStockSummary(data ?? [], assignedByItemId).map((item) => ({
    ...item,
    category_name: item.category?.name ?? "Uncategorised",
  }));

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const categoryId = typeof body.category_id === "string" ? body.category_id : "";
  const quantity = Number(body.quantity);
  const imageUrl = typeof body.image_url === "string" && body.image_url.trim() ? body.image_url.trim() : null;
  const rawImageUrl = typeof body.raw_image_url === "string" && body.raw_image_url.trim() ? body.raw_image_url.trim() : imageUrl;
  const storagePath = typeof body.storage_path === "string" && body.storage_path.trim() ? body.storage_path.trim() : null;
  const bgRemoved = body.bg_removed === true;

  if (!name || name.length > 120) {
    return NextResponse.json({ error: "Item name must be between 1 and 120 characters" }, { status: 400 });
  }
  if (!categoryId) {
    return NextResponse.json({ error: "Category is required" }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    return NextResponse.json({ error: "Quantity must be a whole number" }, { status: 400 });
  }
  if (!imageUrl || !storagePath) {
    return NextResponse.json({ error: "Item image is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: category } = await (admin as any)
    .from("inventory_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("branch_id", auth.branchId)
    .single() as { data: { id: string } | null };

  if (!category) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const { data: item, error } = await (admin as any)
    .from("inventory_accessories")
    .insert({
      branch_id: auth.branchId,
      category_id: categoryId,
      name,
      quantity,
      image_url: imageUrl,
      raw_image_url: rawImageUrl,
      storage_path: storagePath,
      bg_removed: bgRemoved,
      is_archived: false,
    })
    .select("id, branch_id, category_id, name, quantity, image_url, raw_image_url, storage_path, bg_removed, is_archived, created_at, updated_at")
    .single();

  if (error || !item) {
    console.error("[POST /api/branch/inventory/items]", error);
    return NextResponse.json({ error: "Failed to create inventory item" }, { status: 500 });
  }

  await (admin as any).from("inventory_stock_events").insert({
    branch_id: auth.branchId,
    inventory_item_id: item.id,
    assignment_item_id: null,
    event_type: "manual_adjustment",
    quantity_delta: quantity,
    quantity_before: 0,
    quantity_after: quantity,
    reason: "Initial quantity",
    created_by: auth.userId,
  });

  return NextResponse.json(
    { ...item, assigned_quantity: 0, available_quantity: quantity },
    { status: 201 }
  );
}
