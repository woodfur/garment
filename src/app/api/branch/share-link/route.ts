import { NextResponse } from "next/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const authResult = await requireBranchLeader();
  if (authResult instanceof NextResponse) return authResult;
  const { auth } = authResult;

  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from("branches")
    .select("name, view_code")
    .eq("id", auth.branchId)
    .single();

  if (error || !data?.view_code) {
    return NextResponse.json({ error: "Public schedule link not found" }, { status: 404 });
  }

  return NextResponse.json({
    branch_name: data.name,
    view_code: data.view_code,
    public_url: new URL(`/view/${data.view_code}`, req.url).toString(),
  });
}
