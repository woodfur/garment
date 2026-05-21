import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";

type Params = { params: Promise<{ departmentId: string }> };

async function verifyDepartment(departmentId: string, branchId: string) {
  const admin = createAdminClient();
  const { data } = await (admin as any)
    .from("departments")
    .select("id, branch_id")
    .eq("id", departmentId)
    .single() as { data: { id: string; branch_id: string } | null };
  return data?.branch_id === branchId ? data : null;
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
      .from("department_members")
      .select("id, name, created_at")
      .eq("department_id", departmentId)
      .order("name", { ascending: true });

    if (error) throw error;
    return NextResponse.json(data ?? []);
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

    if (!name || name.length > 100) {
      return NextResponse.json(
        { error: "Member name must be between 1 and 100 characters" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data, error } = await (admin as any)
      .from("department_members")
      .insert({ name, department_id: departmentId, branch_id: auth.branchId })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[POST /api/branch/departments/[id]/members]", err);
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}
