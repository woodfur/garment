import { NextResponse } from "next/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";

const EVENT_TYPES = new Set(["manual_adjustment", "assigned", "returned", "damaged", "destroyed", "missing"]);

export async function GET(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("item_id");
  const eventType = searchParams.get("event_type");

  const admin = createAdminClient();
  let query = (admin as any)
    .from("inventory_stock_events")
    .select(`
      id, branch_id, inventory_item_id, assignment_item_id, event_type,
      quantity_delta, quantity_before, quantity_after, reason, created_by, created_at,
      item:inventory_accessories(id, name),
      assignment_item:inventory_assignment_items(
        id,
        assignment:inventory_assignments(
          id,
          schedule:schedules(id, title, service_date),
          department:departments(id, name),
          person:people(id, name, gender)
        )
      )
    `)
    .eq("branch_id", auth.branchId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (itemId) query = query.eq("inventory_item_id", itemId);
  if (eventType && EVENT_TYPES.has(eventType)) query = query.eq("event_type", eventType);

  const { data, error } = await query;
  if (error) {
    console.error("[GET /api/branch/inventory/history]", error);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
