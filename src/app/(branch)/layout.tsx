import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import BranchSidebar from "@/components/branch/BranchSidebar";
import BranchTopbar from "@/components/branch/BranchTopbar";
import MobileTabBar from "@/components/branch/MobileTabBar";

/**
 * getCachedBranchName — cached branches.name lookup, keyed by branchId.
 *
 * Branch names almost never change — 1hr TTL is safe.
 * Throws on error so cache never stores error states.
 * Cache key is ['branch-name', branchId] (branchId appended from fn arg).
 */
const getCachedBranchName = unstable_cache(
  async (branchId: string) => {
    const admin = createAdminClient();
    const { data, error } = await (admin as any)
      .from("branches")
      .select("name")
      .eq("id", branchId)
      .maybeSingle() as { data: { name: string } | null; error: unknown };
    if (error) throw error;
    return data?.name ?? null;
  },
  ["branch-name"],
  { revalidate: 3600 } // 1 hour — branch names rarely change
);

export default async function BranchLayout({ children }: { children: React.ReactNode }) {
  // Step 1: Authenticate (React cache deduplicates within one render tree)
  const auth = await getAuthContext();
  if (!auth) redirect("/auth/login");

  // Step 2: Force password change if required
  if (auth.mustChangePassword) redirect("/branch/change-password");

  // Step 3: Super admins don't belong here
  if (auth.role === "super_admin") redirect("/admin/dashboard");

  // Step 4: Branch leaders must have a branchId
  if (!auth.branchId) redirect("/auth/login");

  // Step 5: Fetch branch name (cached — 1hr TTL, <5ms on cache hit)
  // Sequential with auth — unavoidable dependency on auth.branchId
  const branchName = await getCachedBranchName(auth.branchId);

  // Step 6: Branch record must exist (handles deleted branches)
  if (!branchName) redirect("/auth/login");

  return (
    <div style={{ display: "flex", minHeight: "100dvh", background: "var(--color-bg-primary)" }}>
      <BranchSidebar branchName={branchName} leaderName={auth.fullName} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <BranchTopbar branchName={branchName} leaderName={auth.fullName} email={auth.email} />
        <main className="branch-main" style={{ flex: 1, padding: "2rem", overflowY: "auto" }}>
          {children}
        </main>
      </div>
      <MobileTabBar />
    </div>
  );
}
