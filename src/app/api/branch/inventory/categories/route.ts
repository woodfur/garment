import { NextResponse } from "next/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET() {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from("inventory_categories")
    .select("id, branch_id, name, created_at")
    .eq("branch_id", auth.branchId)
    .order("name", { ascending: true });

  if (error) {
    console.error("[GET /api/branch/inventory/categories]", error);
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name || name.length > 80) {
    return NextResponse.json(
      { error: "Category name must be between 1 and 80 characters" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from("inventory_categories")
    .insert({ branch_id: auth.branchId, name })
    .select("id, branch_id, name, created_at")
    .single();

  if (error?.code === "23505") {
    return NextResponse.json({ error: `A category named "${name}" already exists` }, { status: 409 });
  }
  if (error) {
    console.error("[POST /api/branch/inventory/categories]", error);
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
