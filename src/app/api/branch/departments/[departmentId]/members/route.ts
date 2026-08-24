import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { isGender } from "@/lib/scope";

type Params = { params: Promise<{ departmentId: string }> };
type MemberResponse = {
  id: string;
  membership_id: string;
  person_id: string;
  name: string;
  gender: string;
  created_at: string;
};

async function verifyDepartment(departmentId: string, branchId: string) {
  const admin = createAdminClient();
  const { data } = await (admin as any)
    .from("departments")
    .select("id, branch_id")
    .eq("id", departmentId)
    .single() as { data: { id: string; branch_id: string } | null };
  return data?.branch_id === branchId ? data : null;
}

function memberResponse(row: {
  id: string;
  created_at: string;
  person: { id: string; name: string; gender: string } | null;
}): MemberResponse | null {
  if (!row.person) return null;
  return {
    id: row.id,
    membership_id: row.id,
    person_id: row.person.id,
    name: row.person.name,
    gender: row.person.gender,
    created_at: row.created_at,
  };
}

async function loadMembership(admin: ReturnType<typeof createAdminClient>, membershipId: string) {
  const { data } = await (admin as any)
    .from("department_memberships")
    .select("id, created_at, person:people(id, name, gender)")
    .eq("id", membershipId)
    .single() as { data: { id: string; created_at: string; person: { id: string; name: string; gender: string } | null } | null };

  return data ? memberResponse(data) : null;
}

export async function GET(_request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const { departmentId } = await params;
  const dept = await verifyDepartment(departmentId, auth.branchId);
  if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 });

  try {
    const admin = createAdminClient();
    const { data, error } = await (admin as any)
      .from("department_memberships")
      .select("id, created_at, person:people(id, name, gender)")
      .eq("department_id", departmentId)
      .eq("branch_id", auth.branchId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    const rows = (data ?? []) as Array<{
      id: string;
      created_at: string;
      person: { id: string; name: string; gender: string } | null;
    }>;

    return NextResponse.json(
      (rows
        .map(memberResponse)
        .filter((member): member is MemberResponse => member !== null)
        .sort((a, b) => a.name.localeCompare(b.name))
      )
    );
  } catch (err) {
    console.error("[GET /api/branch/departments/[id]/members]", err);
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const { departmentId } = await params;
  const dept = await verifyDepartment(departmentId, auth.branchId);
  if (!dept) return NextResponse.json({ error: "Department not found" }, { status: 404 });

  try {
    const body = await request.json();
    const name = (body.name ?? "").trim();
    const personId = typeof body.person_id === "string" ? body.person_id : "";
    const gender = body.gender;

    if (!personId && (!name || name.length > 100)) {
      return NextResponse.json(
        { error: "Member name must be between 1 and 100 characters" },
        { status: 400 }
      );
    }
    if (!personId && !isGender(gender)) {
      return NextResponse.json({ error: "Gender must be male or female" }, { status: 400 });
    }

    const admin = createAdminClient();
    let resolvedPersonId = personId;
    if (resolvedPersonId) {
      const { data: person } = await (admin as any)
        .from("people")
        .select("id, branch_id")
        .eq("id", resolvedPersonId)
        .single() as { data: { id: string; branch_id: string } | null };
      if (!person || person.branch_id !== auth.branchId) {
        return NextResponse.json({ error: "Person not found" }, { status: 404 });
      }
    } else {
      const { data: person, error: personError } = await (admin as any)
        .from("people")
        .insert({ name, gender, branch_id: auth.branchId })
        .select("id")
        .single();
      if (personError || !person) throw personError ?? new Error("Failed to create person");
      resolvedPersonId = person.id;
    }

    const { data, error } = await (admin as any)
      .from("department_memberships")
      .upsert(
        { department_id: departmentId, person_id: resolvedPersonId, branch_id: auth.branchId },
        { onConflict: "department_id,person_id" }
      )
      .select("id")
      .single();

    if (error || !data) throw error ?? new Error("Failed to add membership");
    const member = await loadMembership(admin, data.id);
    if (!member) throw new Error("Failed to load member");
    return NextResponse.json(member, { status: 201 });
  } catch (err) {
    console.error("[POST /api/branch/departments/[id]/members]", err);
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}
