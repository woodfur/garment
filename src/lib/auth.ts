import { cache } from "react";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export interface AuthClaims {
  userId: string;
  email: string;
  role: "super_admin" | "branch_leader";
  branchId: string | null;
}

/**
 * getAuthContext — returns the authenticated user's role and branch.
 *
 * Fast path: reads `user_role` from JWT claims injected by the custom_access_token_hook.
 * Fallback: single DB query for sessions that predate the JWT hook.
 *
 * Uses React cache() — deduplicated per request across layout, page, and all server components.
 * Safe: still calls createClient() so @supabase/ssr can refresh the cookie when needed.
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

    // Fast path: JWT claims present (hook active + user logged in after Phase 2)
    const meta = session.user.app_metadata as Record<string, string> | undefined;
    if (meta?.user_role) {
      return {
        userId: session.user.id,
        email: session.user.email ?? "",
        role: meta.user_role as AuthClaims["role"],
        branchId: meta.user_branch_id || null,
      };
    }

    // Fallback: DB query for sessions predating the JWT hook
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role, branch_id")
      .eq("id", session.user.id)
      .single();

    if (!profile) return null;

    const p = profile as { role: string; branch_id: string | null };
    return {
      userId: session.user.id,
      email: session.user.email ?? "",
      role: p.role as AuthClaims["role"],
      branchId: p.branch_id,
    };
  } catch {
    // Malformed cookie, DB failure, or network error — treat as unauthenticated
    return null;
  }
});
