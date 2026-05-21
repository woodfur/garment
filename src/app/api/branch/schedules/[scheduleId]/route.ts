import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;
  const { scheduleId } = await params;
  const body = (await req.json()) as {
    title?: string;
    service_date?: string;
    notes?: string;
  };
  const admin = createAdminClient();

  const { data, error } = await (admin as any)
    .from("schedules")
    .update(body)
    .eq("id", scheduleId)
    .eq("branch_id", auth.branchId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;
  const { scheduleId } = await params;
  const admin = createAdminClient();

  const { error } = await (admin as any)
    .from("schedules")
    .delete()
    .eq("id", scheduleId)
    .eq("branch_id", auth.branchId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
