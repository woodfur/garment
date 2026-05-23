import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";
import type { BodyZone, Gender } from "@/types/database";

// GET /api/branch/combinations/[combinationId]/zones
// Returns { male: Record<zone, uniform>, female: Record<zone, uniform> }
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
    .select("*, uniform:uniforms(*)")
    .eq("combination_id", combinationId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const grouped: Record<string, Record<string, unknown>> = { male: {}, female: {} };
  for (const item of (data ?? []) as Array<{ gender: string; zone: string }>) {
    grouped[item.gender][item.zone] = item;
  }

  return NextResponse.json(grouped);
}

// POST /api/branch/combinations/[combinationId]/zones
// Upserts { gender, zone, uniform_id } — replaces existing assignment for that zone
export async function POST(
  req: Request,
  { params }: { params: Promise<{ combinationId: string }> }
) {
  const authResult = await requireBranchLeader();
  if (authResult instanceof NextResponse) return authResult;
  const { auth } = authResult;

  const { combinationId } = await params;
  const body = await req.json() as { gender: Gender; zone: BodyZone; uniform_id: string };

  if (!body.gender || !body.zone || !body.uniform_id) {
    return NextResponse.json({ error: "gender, zone, and uniform_id are required" }, { status: 400 });
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

  // Upsert — replace existing zone assignment
  const { data, error } = await db
    .from("combination_zone_items")
    .upsert(
      { combination_id: combinationId, gender: body.gender, zone: body.zone, uniform_id: body.uniform_id },
      { onConflict: "combination_id,gender,zone" }
    )
    .select("*, uniform:uniforms(*)")
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
