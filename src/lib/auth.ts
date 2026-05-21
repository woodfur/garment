import { cache } from "react";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export interface AuthClaims {
  userId: string;
  email: string;
  role: "super_admin" | "branch_leader";
  branchId: string | null;
  mustChangePassword: boolean;
  fullName: string | null;
}

/**
 * getAuthContext — returns the authenticated user's role, branch, flags, and name.
 *
 * Always performs a DB query for the full profile because:
 * - must_change_password changes on first login and cannot be read from JWT
 * - full_name is needed by branch layout components (sidebar/topbar)
 *
 * Uses React cache() — deduplicated per request across layout, page, and
 * all server components in the same render tree.
 *
 * Scope: Server Components only. API routes use createClient() directly.
 */
export const getAuthContext = cache(async (): Promise<AuthClaims | null> => {
  try {
    const supabase = await createClient();
    const { data: { user }, error: sessionError } = await supabase.auth.getUser();

    if (sessionError || !user) {
      if (sessionError) {
        console.warn("[getAuthContext] session error (stale token):", sessionError.message);
      }
      return null;
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role, branch_id, must_change_password, full_name")
      .eq("id", user.id)
      .single();

    if (!profile) return null;

    const p = profile as {
      role: string;
      branch_id: string | null;
      must_change_password: boolean;
      full_name: string | null;
    };

    return {
      userId: user.id,
      email: user.email ?? "",
      role: p.role as AuthClaims["role"],
      branchId: p.branch_id,
      mustChangePassword: p.must_change_password,
      fullName: p.full_name,
    };
  } catch (err) {
    console.error("[getAuthContext] failed:", err);
    return null;
  }
});
