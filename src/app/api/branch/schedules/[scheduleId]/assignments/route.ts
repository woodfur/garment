import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { isGender, matchesDepartment } from "@/lib/scope";

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
    gender?: string;
  };

  if (!body.department_id || !body.combination_id) {
    return NextResponse.json(
      { error: "department_id and combination_id are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const db = admin as any;

  // Verify schedule belongs to this branch
  const { data: sched } = await db
    .from("schedules")
    .select("branch_id")
    .eq("id", scheduleId)
    .single();
  if (!sched || sched.branch_id !== auth.branchId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: combo } = await db
    .from("combinations")
    .select("id, branch_id, department_ids, all_departments, gender")
    .eq("id", body.combination_id)
    .single() as { data: { id: string; branch_id: string; department_ids: string[] | null; all_departments: boolean; gender: "male" | "female" | null } | null };

  if (!combo || combo.branch_id !== auth.branchId) {
    return NextResponse.json({ error: "Look not found" }, { status: 404 });
  }
  // A look shared with this department is assignable to it. This is what lets one render
  // serve Ushers, Choir and Praise Team instead of being rebuilt three times.
  if (!matchesDepartment(
    { department_ids: combo.department_ids ?? [], all_departments: combo.all_departments },
    body.department_id
  )) {
    return NextResponse.json({ error: "Look is not shared with that department" }, { status: 400 });
  }
  if (combo.gender && isGender(body.gender) && body.gender !== combo.gender) {
    return NextResponse.json({ error: "Look gender does not match the selected gender" }, { status: 400 });
  }

  const assignmentGender = combo.gender ?? (isGender(body.gender) ? body.gender : null);
  if (!assignmentGender) {
    return NextResponse.json({ error: "Choose a gender before assigning this look" }, { status: 400 });
  }

  const { data, error } = await db
    .from("schedule_assignments")
    .upsert(
      {
        schedule_id: scheduleId,
        department_id: body.department_id,
        gender: assignmentGender,
        combination_id: body.combination_id,
      },
      { onConflict: "schedule_id,department_id,gender" }
    )
    .select(
      "*, department:departments(id, name), combination:combinations(id, name, gender, preview_status, male_composite_url, female_composite_url, male_gif_url, female_gif_url)"
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
  const { department_id, gender } = (await req.json()) as { department_id: string; gender?: string };

  const admin = createAdminClient();
  const db = admin as any;

  // Verify schedule belongs to this branch (same check as POST)
  const { data: sched } = await db
    .from("schedules")
    .select("branch_id")
    .eq("id", scheduleId)
    .single();
  if (!sched || sched.branch_id !== auth.branchId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let query = db
    .from("schedule_assignments")
    .delete()
    .eq("schedule_id", scheduleId)
    .eq("department_id", department_id);
  if (gender === "male" || gender === "female") query = query.eq("gender", gender);

  const { error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
