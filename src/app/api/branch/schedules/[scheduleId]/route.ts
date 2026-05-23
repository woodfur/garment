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

  // Whitelist only permitted fields — prevent branch_id / id injection via admin client
  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = String(body.title).trim();
  if (body.service_date !== undefined) updates.service_date = body.service_date;
  if (body.notes !== undefined) updates.notes = body.notes ? String(body.notes).trim() : null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await (admin as any)
    .from("schedules")
    .update(updates)
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
