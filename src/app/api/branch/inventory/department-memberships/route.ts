import { NextResponse } from "next/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";

async function membershipResponse(admin: ReturnType<typeof createAdminClient>, membershipId: string) {
  const { data, error } = await (admin as any)
    .from("department_memberships")
    .select("id, created_at, person:people(id, name, gender)")
    .eq("id", membershipId)
    .single();

  if (error || !data?.person) return null;

  return {
    id: data.id,
    membership_id: data.id,
    person_id: data.person.id,
    name: data.person.name,
    gender: data.person.gender,
    created_at: data.created_at,
  };
}

export async function POST(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const body = await request.json().catch(() => ({}));
  const departmentId = typeof body.department_id === "string" ? body.department_id : "";
  const personId = typeof body.person_id === "string" ? body.person_id : "";

  if (!departmentId || !personId) {
    return NextResponse.json({ error: "department_id and person_id are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const [{ data: department }, { data: person }] = await Promise.all([
    (admin as any)
      .from("departments")
      .select("id, branch_id")
      .eq("id", departmentId)
      .single() as Promise<{ data: { id: string; branch_id: string } | null }>,
    (admin as any)
      .from("people")
      .select("id, branch_id")
      .eq("id", personId)
      .single() as Promise<{ data: { id: string; branch_id: string } | null }>,
  ]);

  if (!department || department.branch_id !== auth.branchId) {
    return NextResponse.json({ error: "Department not found" }, { status: 404 });
  }
  if (!person || person.branch_id !== auth.branchId) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }

  const { data, error } = await (admin as any)
    .from("department_memberships")
    .upsert(
      { branch_id: auth.branchId, department_id: departmentId, person_id: personId },
      { onConflict: "department_id,person_id" }
    )
    .select("id")
    .single();

  if (error || !data) {
    console.error("[POST /api/branch/inventory/department-memberships]", error);
    return NextResponse.json({ error: "Failed to link member" }, { status: 500 });
  }

  const response = await membershipResponse(admin, data.id);
  if (!response) {
    return NextResponse.json({ error: "Failed to load linked member" }, { status: 500 });
  }

  return NextResponse.json(response, { status: 201 });
}
