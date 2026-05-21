import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";

// DELETE /api/branch/combinations/[combinationId]/zones/[gender]/[zone]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ combinationId: string; gender: string; zone: string }> }
) {
  const authResult = await requireBranchLeader();
  if (authResult instanceof NextResponse) return authResult;
  const { auth } = authResult;

  const { combinationId, gender, zone } = await params;
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

  const { error } = await db
    .from("combination_zone_items")
    .delete()
    .eq("combination_id", combinationId)
    .eq("gender", gender)
    .eq("zone", zone);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
