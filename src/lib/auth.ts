import { cache } from "react";
import { unstable_cache } from "next/cache";
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
 * getCachedProfile — cached profiles DB lookup, keyed by userId.
 *
 * Caching strategy:
 * - TTL-only (revalidate: 60s). No tags — avoids global cache invalidation risk.
 * - Max staleness: 60s for role/must_change_password. Acceptable for internal tool.
 * - Throws on Supabase error so error states are never cached.
 * - Module-level definition so the cached function is created once per process.
 *
 * The actual cache key is ['profile', userId] — unstable_cache appends fn args to key.
 * Each user gets their own isolated cache entry.
 */
const getCachedProfile = unstable_cache(
  async (userId: string) => {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("role, branch_id, must_change_password, full_name")
      .eq("id", userId)
      .single();
    if (error) throw error; // Don't cache Supabase error states
    return data as {
      role: string;
      branch_id: string | null;
      must_change_password: boolean;
      full_name: string | null;
    } | null;
  },
  ["profile"],        // base key namespace — userId appended automatically
  { revalidate: 60 } // TTL-only, no tags
);

/**
 * getAuthContext — returns the authenticated user's role, branch, flags, and name.
 *
 * Two-layer caching:
 * 1. React cache() — deduplicates within one request render tree (layout + page share one call)
 * 2. unstable_cache (getCachedProfile) — persists profiles query across requests (60s TTL)
 *
 * supabase.auth.getUser() is intentionally NOT cached — JWT must be validated each request.
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

    // Cached across requests — avoids DB round-trip on every page navigation
    const profile = await getCachedProfile(user.id);
    if (!profile) return null;

    return {
      userId: user.id,
      email: user.email ?? "",
      role: profile.role as AuthClaims["role"],
      branchId: profile.branch_id,
      mustChangePassword: profile.must_change_password,
      fullName: profile.full_name,
    };
  } catch (err) {
    console.error("[getAuthContext] failed:", err);
    return null;
  }
});
