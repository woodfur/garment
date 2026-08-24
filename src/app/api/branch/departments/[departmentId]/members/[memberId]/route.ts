import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";

type Params = { params: Promise<{ departmentId: string; memberId: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const { departmentId, memberId } = await params;

  try {
    const admin = createAdminClient();

    // memberId is the department_memberships.id. Removing a member from one department
    // must not delete the person, because the same person may serve elsewhere.
    const { data: member } = await (admin as any)
      .from("department_memberships")
      .select("id, branch_id")
      .eq("id", memberId)
      .eq("department_id", departmentId)
      .single() as { data: { id: string; branch_id: string } | null };

    if (!member || member.branch_id !== auth.branchId) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const { error } = await (admin as any)
      .from("department_memberships")
      .delete()
      .eq("id", memberId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/branch/departments/[id]/members/[memberId]]", err);
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 });
  }
}
