import { NextResponse } from "next/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";
import { isGender } from "@/lib/scope";

export async function GET(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const admin = createAdminClient();

  let query = (admin as any)
    .from("people")
    .select("id, branch_id, name, gender, created_at")
    .eq("branch_id", auth.branchId)
    .order("name", { ascending: true })
    .limit(10);

  if (q) query = query.ilike("name", `%${q}%`);

  const { data, error } = await query;
  if (error) {
    console.error("[GET /api/branch/inventory/people]", error);
    return NextResponse.json({ error: "Failed to fetch people" }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const result = await requireBranchLeader();
  if (result instanceof NextResponse) return result;
  const { auth } = result;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const gender = body.gender;

  if (!name || name.length > 100) {
    return NextResponse.json({ error: "Name must be between 1 and 100 characters" }, { status: 400 });
  }
  if (!isGender(gender)) {
    return NextResponse.json({ error: "Gender must be male or female" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from("people")
    .insert({ branch_id: auth.branchId, name, gender })
    .select("id, branch_id, name, gender, created_at")
    .single();

  if (error) {
    console.error("[POST /api/branch/inventory/people]", error);
    return NextResponse.json({ error: "Failed to create person" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
