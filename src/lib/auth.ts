import { cache } from "react";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export interface AuthClaims {
  userId: string;
  email: string;
  role: "super_admin" | "branch_leader";
  branchId: string | null;
  mustChangePassword: boolean;
}

/**
 * getAuthContext — returns the authenticated user's role, branch, and flags.
 *
 * Always performs a DB query for the full profile because:
 * - must_change_password changes on first login and cannot be read from JWT
 * - JWT fast path only saves the role/branchId lookup; branch pages always
 *   need fresh profile data
 *
 * Uses React cache() — deduplicated per request across layout, page, and
 * all server components in the same render tree.
 *
 * Scope: Server Components only. API routes use createClient() directly.
 */
export const getAuthContext = cache(async (): Promise<AuthClaims | null> => {
  try {
    // Must call createClient() to maintain @supabase/ssr cookie refresh mechanism.
    // getSession() reads from the cookie store — no network call in normal operation.
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) return null;

    // Always read profile from DB — must_change_password cannot come from JWT
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role, branch_id, must_change_password")
      .eq("id", session.user.id)
      .single();

    if (!profile) return null;

    const p = profile as {
      role: string;
      branch_id: string | null;
      must_change_password: boolean;
    };

    return {
      userId: session.user.id,
      email: session.user.email ?? "",
      role: p.role as AuthClaims["role"],
      branchId: p.branch_id,
      mustChangePassword: p.must_change_password,
    };
  } catch {
    // Malformed cookie, DB failure, or network error — treat as unauthenticated
    return null;
  }
});
