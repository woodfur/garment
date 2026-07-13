import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";

export async function GET(_req: Request) {
  const authResult = await requireBranchLeader();
  if (authResult instanceof NextResponse) return authResult;
  const { auth } = authResult;

  const admin = createAdminClient();
  // Cast to any for complex relational join — schedule_assignments relation not in generated types
  const { data, error } = await (admin as any)
    .from("schedules")
    .select(
      `
      *,
      assignments:schedule_assignments(
        *,
        department:departments(id, name),
        combination:combinations(id, name, gender, preview_status, male_composite_url, female_composite_url, male_gif_url, female_gif_url, department_id)
      )
    `
    )
    .eq("branch_id", auth.branchId)
    .order("service_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const authResult = await requireBranchLeader();
  if (authResult instanceof NextResponse) return authResult;
  const { auth } = authResult;

  const body = (await req.json()) as {
    service_date: string;
    title: string;
    notes?: string;
  };
  if (!body.service_date || !body.title) {
    return NextResponse.json(
      { error: "service_date and title are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from("schedules")
    .insert({
      branch_id: auth.branchId,
      service_date: body.service_date,
      title: body.title,
      notes: body.notes ?? null,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
