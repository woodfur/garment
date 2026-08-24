import { NextResponse } from "next/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";
import {
  resolvedWasOverdue,
  stockDeltaForResolution,
  type InventoryResolutionStatus,
} from "@/lib/inventory";

type Params = { params: Promise<{ assignmentItemId: string }> };

const RESOLUTION_STATUSES = new Set(["returned", "damaged", "destroyed", "missing"]);

export async function PATCH(request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;
  const { assignmentItemId } = await params;

  const body = await request.json().catch(() => ({}));
  const status = typeof body.status === "string" ? body.status : "";
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  if (!RESOLUTION_STATUSES.has(status)) {
    return NextResponse.json({ error: "Status must be returned, damaged, destroyed, or missing" }, { status: 400 });
  }

  const admin = createAdminClient();
  const db = admin as any;

  const { data: line } = await db
    .from("inventory_assignment_items")
    .select(`
      id, assignment_id, inventory_item_id, quantity, status, was_overdue,
      item:inventory_accessories(id, branch_id, quantity),
      assignment:inventory_assignments(
        id, branch_id,
        schedule:schedules(id, service_date)
      )
    `)
    .eq("id", assignmentItemId)
    .single() as {
      data: {
        id: string;
        inventory_item_id: string;
        quantity: number;
        status: string;
        was_overdue: boolean;
        item: { id: string; branch_id: string; quantity: number } | null;
        assignment: { id: string; branch_id: string; schedule: { service_date: string } | null } | null;
      } | null;
    };

  if (!line || !line.assignment || line.assignment.branch_id !== auth.branchId || !line.item) {
    return NextResponse.json({ error: "Assignment item not found" }, { status: 404 });
  }
  if (line.status !== "assigned") {
    return NextResponse.json({ error: "Item has already been resolved" }, { status: 409 });
  }
  if (!line.assignment.schedule?.service_date) {
    return NextResponse.json({ error: "Service date not found" }, { status: 500 });
  }

  const resolution = status as InventoryResolutionStatus;
  const quantityDelta = stockDeltaForResolution(resolution, line.quantity);
  const quantityBefore = line.item.quantity;
  const quantityAfter = quantityBefore + quantityDelta;

  if (quantityAfter < 0) {
    return NextResponse.json({ error: "Inventory quantity cannot go below zero" }, { status: 409 });
  }

  if (quantityDelta !== 0) {
    const { error: stockError } = await db
      .from("inventory_accessories")
      .update({ quantity: quantityAfter })
      .eq("id", line.inventory_item_id)
      .eq("branch_id", auth.branchId);

    if (stockError) {
      console.error("[PATCH /api/branch/inventory/assignments/items/[id]] stock", stockError);
      return NextResponse.json({ error: "Failed to update inventory quantity" }, { status: 500 });
    }
  }

  const wasOverdue = resolvedWasOverdue({
    existingWasOverdue: line.was_overdue,
    serviceDate: line.assignment.schedule.service_date,
  });

  const { data: updated, error } = await db
    .from("inventory_assignment_items")
    .update({
      status: resolution,
      returned_at: new Date().toISOString(),
      was_overdue: wasOverdue,
      notes,
    })
    .eq("id", assignmentItemId)
    .select(`
      id, assignment_id, inventory_item_id, quantity, status, returned_at,
      was_overdue, notes, created_at, updated_at,
      item:inventory_accessories(id, name, image_url, bg_removed, quantity, category:inventory_categories(name))
    `)
    .single();

  if (error || !updated) {
    console.error("[PATCH /api/branch/inventory/assignments/items/[id]] item", error);
    return NextResponse.json({ error: "Failed to update assignment item" }, { status: 500 });
  }

  await db.from("inventory_stock_events").insert({
    branch_id: auth.branchId,
    inventory_item_id: line.inventory_item_id,
    assignment_item_id: line.id,
    event_type: resolution,
    quantity_delta: quantityDelta,
    quantity_before: quantityBefore,
    quantity_after: quantityAfter,
    reason: notes,
    created_by: auth.userId,
  });

  return NextResponse.json(updated);
}
