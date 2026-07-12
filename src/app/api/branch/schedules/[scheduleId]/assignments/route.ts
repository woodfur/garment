import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;
  const { scheduleId } = await params;
  const body = (await req.json()) as {
    department_id: string;
    combination_id: string;
  };

  if (!body.department_id || !body.combination_id) {
    return NextResponse.json(
      { error: "department_id and combination_id are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify schedule belongs to this branch
  const { data: sched } = await (admin as any)
    .from("schedules")
    .select("branch_id")
    .eq("id", scheduleId)
    .single();
  if (!sched || sched.branch_id !== auth.branchId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await (admin as any)
    .from("schedule_assignments")
    .upsert(
      {
        schedule_id: scheduleId,
        department_id: body.department_id,
        combination_id: body.combination_id,
      },
      { onConflict: "schedule_id,department_id" }
    )
    .select(
      "*, department:departments(id, name), combination:combinations(id, name, preview_status, male_composite_url, female_composite_url, male_gif_url, female_gif_url)"
    )
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;
  const { scheduleId } = await params;
  const { department_id } = (await req.json()) as { department_id: string };

  const admin = createAdminClient();

  // Verify schedule belongs to this branch (same check as POST)
  const { data: sched } = await (admin as any)
    .from("schedules")
    .select("branch_id")
    .eq("id", scheduleId)
    .single();
  if (!sched || sched.branch_id !== auth.branchId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await (admin as any)
    .from("schedule_assignments")
    .delete()
    .eq("schedule_id", scheduleId)
    .eq("department_id", department_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
