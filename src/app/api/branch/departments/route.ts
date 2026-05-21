import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { requireBranchLeader } from "@/lib/api-auth";

export async function GET() {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  try {
    const admin = createAdminClient();

    // Fetch departments with counts via aggregation
    const { data, error } = await (admin as any)
      .from("departments")
      .select(`
        id, name, description, branch_id, created_at,
        uniforms(count),
        combinations(count),
        department_members(count)
      `)
      .eq("branch_id", auth.branchId)
      .order("created_at", { ascending: true }) as {
        data: Array<{
          id: string; name: string; description: string | null;
          branch_id: string; created_at: string;
          uniforms: [{ count: number }];
          combinations: [{ count: number }];
          department_members: [{ count: number }];
        }> | null;
        error: unknown;
      };

    if (error) throw error;

    const departments = (data ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      branch_id: d.branch_id,
      created_at: d.created_at,
      uniform_count: d.uniforms?.[0]?.count ?? 0,
      combination_count: d.combinations?.[0]?.count ?? 0,
      member_count: d.department_members?.[0]?.count ?? 0,
    }));

    return NextResponse.json(departments);
  } catch (err) {
    console.error("[GET /api/branch/departments]", err);
    return NextResponse.json({ error: "Failed to fetch departments" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  try {
    const body = await request.json();
    const name = (body.name ?? "").trim();
    const description = (body.description ?? "").trim() || null;

    if (!name || name.length > 100) {
      return NextResponse.json(
        { error: "Department name must be between 1 and 100 characters" },
        { status: 400 }
      );
    }

    const admin = createAdminClient();
    const { data, error } = await (admin as any)
      .from("departments")
      .insert({ name, description, branch_id: auth.branchId })
      .select()
      .single() as { data: unknown; error: { code?: string; message: string } | null };

    if (error) {
      // Unique constraint violation — duplicate name in this branch
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `A department named "${name}" already exists` },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[POST /api/branch/departments]", err);
    return NextResponse.json({ error: "Failed to create department" }, { status: 500 });
  }
}
