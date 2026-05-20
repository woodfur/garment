import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminTopbar from "@/components/admin/AdminTopbar";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthContext();

  if (!auth) redirect("/auth/login");
  if (auth.role !== "super_admin") redirect("/branch/dashboard");

  // Profile shape expected by AdminTopbar
  const profile = {
    id: auth.userId,
    email: auth.email,
    full_name: null,
    role: auth.role,
    branch_id: auth.branchId,
    avatar_url: null,
    created_at: "",
    must_change_password: false,
  };

  return (
    <div style={{ display: "flex", minHeight: "100dvh", background: "var(--color-bg-primary)" }}>
      <AdminSidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <AdminTopbar profile={profile} />
        <main style={{ flex: 1, padding: "2rem", overflowY: "auto" }}>
          {children}
        </main>
      </div>
    </div>
  );
}
