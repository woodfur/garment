import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";
import type { BodyZone, Gender } from "@/types/database";

// GET /api/branch/combinations/[combinationId]/zones
// Returns { male: Record<zone, item>, female: Record<zone, item> }
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ combinationId: string }> }
) {
  const authResult = await requireBranchLeader();
  if (authResult instanceof NextResponse) return authResult;
  const { auth } = authResult;

  const { combinationId } = await params;
  const admin = createAdminClient();
  const db = admin as any;

  // Verify the combination belongs to this branch
  const { data: combo } = await db
    .from("combinations")
    .select("branch_id")
    .eq("id", combinationId)
    .single() as { data: { branch_id: string } | null };

  if (!combo || combo.branch_id !== auth.branchId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await (admin as any)
    .from("combination_zone_items")
    .select("*, uniform:uniforms(*), inventory_item:inventory_accessories(*)")
    .eq("combination_id", combinationId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const grouped: Record<string, Record<string, unknown>> = { male: {}, female: {} };
  for (const item of (data ?? []) as Array<{ gender: string; zone: string }>) {
    grouped[item.gender][item.zone] = item;
  }

  return NextResponse.json(grouped);
}

// POST /api/branch/combinations/[combinationId]/zones
// Upserts { gender, zone, uniform_id | inventory_item_id } — replaces existing assignment for that zone
export async function POST(
  req: Request,
  { params }: { params: Promise<{ combinationId: string }> }
) {
  const authResult = await requireBranchLeader();
  if (authResult instanceof NextResponse) return authResult;
  const { auth } = authResult;

  const { combinationId } = await params;
  const body = await req.json() as {
    gender: Gender;
    zone: BodyZone;
    uniform_id?: string | null;
    inventory_item_id?: string | null;
  };
  const uniformId = typeof body.uniform_id === "string" && body.uniform_id ? body.uniform_id : null;
  const inventoryItemId = typeof body.inventory_item_id === "string" && body.inventory_item_id ? body.inventory_item_id : null;
  const zone = typeof body.zone === "string" ? body.zone : "";

  if (!body.gender || !zone || (uniformId ? 1 : 0) + (inventoryItemId ? 1 : 0) !== 1) {
    return NextResponse.json({ error: "gender, zone, and exactly one item source are required" }, { status: 400 });
  }
  if (inventoryItemId && !zone.startsWith("accessory_")) {
    return NextResponse.json({ error: "Inventory items can only be assigned to accessory zones" }, { status: 400 });
  }

  const admin = createAdminClient();
  const db = admin as any;

  // Verify combination belongs to this branch
  const { data: combo } = await db
    .from("combinations")
    .select("branch_id")
    .eq("id", combinationId)
    .single() as { data: { branch_id: string } | null };

  if (!combo || combo.branch_id !== auth.branchId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (uniformId) {
    const { data: uniform } = await db
      .from("uniforms")
      .select("id")
      .eq("id", uniformId)
      .eq("branch_id", auth.branchId)
      .single() as { data: { id: string } | null };

    if (!uniform) {
      return NextResponse.json({ error: "Uniform not found" }, { status: 404 });
    }
  }

  if (inventoryItemId) {
    const { data: inventoryItem } = await db
      .from("inventory_accessories")
      .select("id")
      .eq("id", inventoryItemId)
      .eq("branch_id", auth.branchId)
      .eq("is_archived", false)
      .single() as { data: { id: string } | null };

    if (!inventoryItem) {
      return NextResponse.json({ error: "Inventory item not found" }, { status: 404 });
    }
  }

  // Upsert — replace existing zone assignment
  const { data, error } = await db
    .from("combination_zone_items")
    .upsert(
      {
        combination_id: combinationId,
        gender: body.gender,
        zone,
        uniform_id: uniformId,
        inventory_item_id: inventoryItemId,
      },
      { onConflict: "combination_id,gender,zone" }
    )
    .select("*, uniform:uniforms(*), inventory_item:inventory_accessories(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// DELETE /api/branch/combinations/[combinationId]/zones
// Clears ALL zone items for this combination (used before re-inserting on save).
// Accepts optional body { gender } to clear only one gender's zones.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ combinationId: string }> }
) {
  const authResult = await requireBranchLeader();
  if (authResult instanceof NextResponse) return authResult;
  const { auth } = authResult;

  const { combinationId } = await params;
  const admin = createAdminClient();
  const db = admin as any;

  // Verify combination belongs to this branch
  const { data: combo } = await db
    .from("combinations")
    .select("branch_id")
    .eq("id", combinationId)
    .single() as { data: { branch_id: string } | null };

  if (!combo || combo.branch_id !== auth.branchId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Optional: filter by gender if specified in body
  let body: { gender?: string } = {};
  try { body = await req.json(); } catch { /* no body = clear all */ }

  let query = db.from("combination_zone_items").delete().eq("combination_id", combinationId);
  if (body.gender === "male" || body.gender === "female") {
    query = query.eq("gender", body.gender);
  }

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
