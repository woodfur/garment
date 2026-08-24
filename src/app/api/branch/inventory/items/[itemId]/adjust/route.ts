import { NextResponse } from "next/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ itemId: string }> };

async function unresolvedAssignedQuantity(
  admin: ReturnType<typeof createAdminClient>,
  branchId: string,
  itemId: string
): Promise<number> {
  const { data } = await (admin as any)
    .from("inventory_assignment_items")
    .select("quantity, assignment:inventory_assignments(branch_id)")
    .eq("inventory_item_id", itemId)
    .eq("status", "assigned");

  return ((data ?? []) as Array<{ quantity: number; assignment: { branch_id: string } | null }>)
    .filter((row) => row.assignment?.branch_id === branchId)
    .reduce((total, row) => total + row.quantity, 0);
}

export async function POST(request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;
  const { itemId } = await params;

  const body = await request.json().catch(() => ({}));
  const newQuantity = Number(body.newQuantity);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!Number.isInteger(newQuantity) || newQuantity < 0) {
    return NextResponse.json({ error: "Quantity must be a whole number" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "Adjustment reason is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: item } = await (admin as any)
    .from("inventory_accessories")
    .select("id, branch_id, quantity")
    .eq("id", itemId)
    .single() as { data: { id: string; branch_id: string; quantity: number } | null };

  if (!item || item.branch_id !== auth.branchId) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const unresolvedAssigned = await unresolvedAssignedQuantity(admin, auth.branchId, itemId);
  if (newQuantity < unresolvedAssigned) {
    return NextResponse.json(
      { error: `Quantity cannot be below ${unresolvedAssigned} currently assigned items` },
      { status: 409 }
    );
  }

  const quantityBefore = item.quantity;
  const quantityAfter = newQuantity;
  const quantityDelta = quantityAfter - quantityBefore;

  const { data: updated, error } = await (admin as any)
    .from("inventory_accessories")
    .update({ quantity: quantityAfter })
    .eq("id", itemId)
    .eq("branch_id", auth.branchId)
    .select("id, branch_id, category_id, name, quantity, image_url, raw_image_url, storage_path, bg_removed, is_archived, created_at, updated_at")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Failed to adjust quantity" }, { status: 500 });
  }

  await (admin as any).from("inventory_stock_events").insert({
    branch_id: auth.branchId,
    inventory_item_id: itemId,
    assignment_item_id: null,
    event_type: "manual_adjustment",
    quantity_delta: quantityDelta,
    quantity_before: quantityBefore,
    quantity_after: quantityAfter,
    reason,
    created_by: auth.userId,
  });

  return NextResponse.json(updated);
}
