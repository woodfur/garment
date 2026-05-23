import { NextResponse } from "next/server";
import { getAuthContext, type AuthClaims } from "@/lib/auth";

export type BranchLeaderAuth = {
  auth: AuthClaims & { branchId: string };
};

/**
 * requireBranchLeader — shared auth guard for all branch API routes.
 *
 * Checks:
 * 1. Valid session (via getAuthContext which calls supabase.auth.getUser())
 * 2. Role must be 'branch_leader'
 * 3. branchId must be present
 *
 * Usage in route handlers:
 *   const result = await requireBranchLeader();
 *   if (result instanceof NextResponse) return result;
 *   const { auth } = result;
 */
export async function requireBranchLeader(): Promise<BranchLeaderAuth | NextResponse> {
  const auth = await getAuthContext();

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (auth.role !== "branch_leader") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!auth.branchId) {
    return NextResponse.json({ error: "No branch assigned" }, { status: 403 });
  }

  return { auth: { ...auth, branchId: auth.branchId } };
}

export type SuperAdminAuth = {
  auth: AuthClaims;
};

/**
 * requireSuperAdmin — shared auth guard for all /api/admin/* routes.
 *
 * Checks:
 * 1. Valid session
 * 2. Role must be 'super_admin'
 *
 * Usage in route handlers:
 *   const result = await requireSuperAdmin();
 *   if (result instanceof NextResponse) return result;
 *   const { auth } = result;
 */
export async function requireSuperAdmin(): Promise<SuperAdminAuth | NextResponse> {
  const auth = await getAuthContext();

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (auth.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return { auth };
}
