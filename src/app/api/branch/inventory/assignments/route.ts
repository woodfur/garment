import { NextResponse } from "next/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { assertCanAssign, isOverdueAssignmentLine } from "@/lib/inventory";

type AssignmentItemInput = {
  inventory_item_id?: string;
  quantity?: number;
  notes?: string | null;
};

async function assignedQuantityByItem(
  admin: ReturnType<typeof createAdminClient>,
  branchId: string,
  itemIds?: string[]
) {
  let query = (admin as any)
    .from("inventory_assignment_items")
    .select("inventory_item_id, quantity, assignment:inventory_assignments(branch_id)")
    .eq("status", "assigned");

  if (itemIds && itemIds.length > 0) query = query.in("inventory_item_id", itemIds);

  const { data } = await query;
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

function groupedItems(items: AssignmentItemInput[]) {
  const byId = new Map<string, { inventory_item_id: string; quantity: number; notes: string | null }>();
  for (const raw of items) {
    const id = typeof raw.inventory_item_id === "string" ? raw.inventory_item_id : "";
    const quantity = Number(raw.quantity);
    if (!id || !Number.isInteger(quantity) || quantity <= 0) continue;
    const current = byId.get(id);
    byId.set(id, {
      inventory_item_id: id,
      quantity: (current?.quantity ?? 0) + quantity,
      notes: typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.trim() : current?.notes ?? null,
    });
  }
  return [...byId.values()];
}

function decorateAssignments(rows: any[]) {
  return rows.map((assignment) => ({
    ...assignment,
    items: (assignment.items ?? []).map((item: any) => ({
      ...item,
      is_overdue: isOverdueAssignmentLine({
        status: item.status,
        serviceDate: assignment.schedule?.service_date,
      }),
    })),
  }));
}

export async function GET(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const { searchParams } = new URL(request.url);
  const scheduleId = searchParams.get("schedule_id");
  const departmentId = searchParams.get("department_id");
  const admin = createAdminClient();

  let query = (admin as any)
    .from("inventory_assignments")
    .select(`
      id, branch_id, schedule_id, department_id, person_id, created_by, created_at,
      schedule:schedules(id, title, service_date),
      department:departments(id, name),
      person:people(id, name, gender),
      items:inventory_assignment_items(
        id, assignment_id, inventory_item_id, quantity, status, returned_at,
        was_overdue, notes, created_at, updated_at,
        item:inventory_accessories(id, name, image_url, bg_removed, quantity, category:inventory_categories(name))
      )
    `)
    .eq("branch_id", auth.branchId)
    .order("created_at", { ascending: false });

  if (scheduleId) query = query.eq("schedule_id", scheduleId);
  if (departmentId) query = query.eq("department_id", departmentId);

  const { data, error } = await query;
  if (error) {
    console.error("[GET /api/branch/inventory/assignments]", error);
    return NextResponse.json({ error: "Failed to fetch assignments" }, { status: 500 });
  }

  return NextResponse.json(decorateAssignments(data ?? []));
}

export async function POST(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const body = await request.json().catch(() => ({}));
  const scheduleId = typeof body.schedule_id === "string" ? body.schedule_id : "";
  const departmentId = typeof body.department_id === "string" ? body.department_id : "";
  const personId = typeof body.person_id === "string" ? body.person_id : "";
  const items = groupedItems(Array.isArray(body.items) ? body.items : []);

  if (!scheduleId || !departmentId || !personId || items.length === 0) {
    return NextResponse.json(
      { error: "schedule_id, department_id, person_id, and at least one item are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const db = admin as any;

  const [{ data: schedule }, { data: department }, { data: membership }] = await Promise.all([
    db.from("schedules").select("id, branch_id").eq("id", scheduleId).single(),
    db.from("departments").select("id, branch_id").eq("id", departmentId).single(),
    db
      .from("department_memberships")
      .select("id, person:people(id, name, gender)")
      .eq("branch_id", auth.branchId)
      .eq("department_id", departmentId)
      .eq("person_id", personId)
      .single(),
  ]) as [
    { data: { id: string; branch_id: string } | null },
    { data: { id: string; branch_id: string } | null },
    { data: { id: string; person: { id: string; name: string; gender: string } | null } | null },
  ];

  if (!schedule || schedule.branch_id !== auth.branchId) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }
  if (!department || department.branch_id !== auth.branchId) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }
  if (!membership?.person) {
    return NextResponse.json({ error: "Member is not in that department" }, { status: 400 });
  }

  const itemIds = items.map((item) => item.inventory_item_id);
  const [{ data: stockRows, error: stockError }, assignedByItemId] = await Promise.all([
    db
      .from("inventory_accessories")
      .select("id, branch_id, category_id, name, quantity, image_url, raw_image_url, storage_path, bg_removed, is_archived, created_at, updated_at")
      .eq("branch_id", auth.branchId)
      .eq("is_archived", false)
      .in("id", itemIds) as Promise<{ data: Array<{ id: string; name: string; quantity: number }> | null; error: { message: string } | null }>,
    assignedQuantityByItem(admin, auth.branchId, itemIds),
  ]);

  if (stockError) {
    console.error("[POST /api/branch/inventory/assignments] stock", stockError);
    return NextResponse.json({ error: "Failed to check inventory" }, { status: 500 });
  }

  const stockById = new Map((stockRows ?? []).map((item) => [item.id, item]));
  if (stockById.size !== itemIds.length) {
    return NextResponse.json({ error: "One or more items were not found" }, { status: 404 });
  }

  try {
    for (const item of items) {
      const stock = stockById.get(item.inventory_item_id)!;
      assertCanAssign({
        itemName: stock.name,
        quantity: stock.quantity,
        unresolvedQuantity: assignedByItemId.get(item.inventory_item_id) ?? 0,
        requestedQuantity: item.quantity,
      });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Not enough stock available" },
      { status: 409 }
    );
  }

  const { data: assignment, error: assignmentError } = await db
    .from("inventory_assignments")
    .upsert(
      {
        branch_id: auth.branchId,
        schedule_id: scheduleId,
        department_id: departmentId,
        person_id: personId,
        created_by: auth.userId,
      },
      { onConflict: "schedule_id,department_id,person_id" }
    )
    .select("id")
    .single();

  if (assignmentError || !assignment) {
    console.error("[POST /api/branch/inventory/assignments] assignment", assignmentError);
    return NextResponse.json({ error: "Failed to create assignment" }, { status: 500 });
  }

  const lineRows = items.map((item) => ({
    assignment_id: assignment.id,
    inventory_item_id: item.inventory_item_id,
    quantity: item.quantity,
    status: "assigned",
    returned_at: null,
    was_overdue: false,
    notes: item.notes,
  }));

  const { data: lines, error: linesError } = await db
    .from("inventory_assignment_items")
    .insert(lineRows)
    .select("id, inventory_item_id, quantity");

  if (linesError || !lines) {
    console.error("[POST /api/branch/inventory/assignments] items", linesError);
    return NextResponse.json({ error: "Failed to assign items" }, { status: 500 });
  }

  await db.from("inventory_stock_events").insert(lines.map((line: any) => {
    const before = stockById.get(line.inventory_item_id)!.quantity - (assignedByItemId.get(line.inventory_item_id) ?? 0);
    assignedByItemId.set(line.inventory_item_id, (assignedByItemId.get(line.inventory_item_id) ?? 0) + line.quantity);
    return {
      branch_id: auth.branchId,
      inventory_item_id: line.inventory_item_id,
      assignment_item_id: line.id,
      event_type: "assigned",
      quantity_delta: -line.quantity,
      quantity_before: before,
      quantity_after: before - line.quantity,
      reason: `Assigned to ${membership.person!.name}`,
      created_by: auth.userId,
    };
  }));

  const { data: saved } = await db
    .from("inventory_assignments")
    .select(`
      id, branch_id, schedule_id, department_id, person_id, created_by, created_at,
      schedule:schedules(id, title, service_date),
      department:departments(id, name),
      person:people(id, name, gender),
      items:inventory_assignment_items(
        id, assignment_id, inventory_item_id, quantity, status, returned_at,
        was_overdue, notes, created_at, updated_at,
        item:inventory_accessories(id, name, image_url, bg_removed, quantity, category:inventory_categories(name))
      )
    `)
    .eq("id", assignment.id)
    .single();

  return NextResponse.json(decorateAssignments(saved ? [saved] : [])[0] ?? { id: assignment.id }, { status: 201 });
}
