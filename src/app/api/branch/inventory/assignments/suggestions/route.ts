import { NextResponse } from "next/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { withStockSummary } from "@/lib/inventory";

type SuggestedItemRow = {
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

async function assignedQuantityByItem(
  admin: ReturnType<typeof createAdminClient>,
  branchId: string,
  itemIds: string[]
) {
  const { data } = await (admin as any)
    .from("inventory_assignment_items")
    .select("inventory_item_id, quantity, assignment:inventory_assignments(branch_id)")
    .eq("status", "assigned")
    .in("inventory_item_id", itemIds);

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
  const scheduleId = searchParams.get("schedule_id") ?? "";
  const departmentId = searchParams.get("department_id") ?? "";
  const personId = searchParams.get("person_id") ?? "";

  if (!scheduleId || !departmentId || !personId) {
    return NextResponse.json({ error: "schedule_id, department_id, and person_id are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const db = admin as any;

  const [{ data: schedule }, { data: membership }] = await Promise.all([
    db.from("schedules").select("id, branch_id").eq("id", scheduleId).single() as Promise<{ data: { id: string; branch_id: string } | null }>,
    db
      .from("department_memberships")
      .select("id, person:people(id, gender)")
      .eq("branch_id", auth.branchId)
      .eq("department_id", departmentId)
      .eq("person_id", personId)
      .single() as Promise<{ data: { id: string; person: { id: string; gender: "male" | "female" } | null } | null }>,
  ]);

  if (!schedule || schedule.branch_id !== auth.branchId) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }
  if (!membership?.person) {
    return NextResponse.json({ error: "Member is not in that department" }, { status: 400 });
  }

  const { data: scheduleAssignment } = await db
    .from("schedule_assignments")
    .select("combination_id")
    .eq("schedule_id", scheduleId)
    .eq("department_id", departmentId)
    .eq("gender", membership.person.gender)
    .single() as { data: { combination_id: string } | null };

  if (!scheduleAssignment?.combination_id) {
    return NextResponse.json([]);
  }

  const { data: zoneItems, error } = await db
    .from("combination_zone_items")
    .select(`
      inventory_item_id,
      item:inventory_accessories(
        id, branch_id, category_id, name, quantity, image_url, raw_image_url,
        storage_path, bg_removed, is_archived, created_at, updated_at,
        category:inventory_categories(name)
      )
    `)
    .eq("combination_id", scheduleAssignment.combination_id)
    .eq("gender", membership.person.gender)
    .not("inventory_item_id", "is", null) as {
      data: Array<{
        inventory_item_id: string;
        item: {
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
        } | null;
      }> | null;
      error: { message: string } | null;
    };

  if (error) {
    console.error("[GET /api/branch/inventory/assignments/suggestions]", error);
    return NextResponse.json({ error: "Failed to load suggestions" }, { status: 500 });
  }

  const uniqueItems = new Map<string, SuggestedItemRow>();
  for (const row of zoneItems ?? []) {
    if (row.item && row.item.branch_id === auth.branchId && !row.item.is_archived) {
      uniqueItems.set(row.item.id, row.item);
    }
  }

  const items = [...uniqueItems.values()];
  const assignedByItemId = await assignedQuantityByItem(admin, auth.branchId, items.map((item) => item.id));
  const rows = withStockSummary(items, assignedByItemId).map((item) => ({
    ...item,
    category_name: item.category?.name ?? "Uncategorised",
    suggested_quantity: 1,
  }));

  return NextResponse.json(rows);
}
