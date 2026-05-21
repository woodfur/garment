import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import BranchSidebar from "@/components/branch/BranchSidebar";
import BranchTopbar from "@/components/branch/BranchTopbar";

export default async function BranchLayout({ children }: { children: React.ReactNode }) {
  // Step 1: Authenticate
  const auth = await getAuthContext();
  if (!auth) redirect("/auth/login");

  // Step 2: Force password change if required
  if (auth.mustChangePassword) redirect("/branch/change-password");

  // Step 3: Super admins don't belong here — send to their portal
  if (auth.role === "super_admin") redirect("/admin/dashboard");

  // Step 4: Branch leaders must have a branchId
  if (!auth.branchId) redirect("/auth/login");

  // Step 5: Fetch branch name for the sidebar/topbar
  // Sequential (not parallel) — depends on auth.branchId from step 4
  const adminClient = createAdminClient();
  const { data: branch } = await (adminClient as any)
    .from("branches")
    .select("name")
    .eq("id", auth.branchId)
    .maybeSingle() as { data: { name: string } | null };

  // Step 6: Branch record must exist (handles deleted branches)
  if (!branch) redirect("/auth/login");

  return (
    <div style={{ display: "flex", minHeight: "100dvh", background: "var(--color-bg-primary)" }}>
      <BranchSidebar branchName={branch.name} leaderName={auth.fullName} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <BranchTopbar branchName={branch.name} leaderName={auth.fullName} email={auth.email} />
        <main style={{ flex: 1, padding: "2rem", overflowY: "auto" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
