import { createAdminClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";
import { Building2, Users, Activity } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { Branch } from "@/types/database";

const getDashboardStats = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const [{ count: branchCount }, { count: leaderCount }, { data: recentBranches }] =
      await Promise.all([
        supabase.from("branches").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("*", { count: "exact", head: true }).eq("role", "branch_leader"),
        supabase.from("branches").select("id, name, slug, view_code, created_at").order("created_at", { ascending: false }).limit(5),
      ]);
    return { branchCount, leaderCount, recentBranches };
  },
  ["dashboard-stats"],
  { tags: ["branches"], revalidate: 30 }
);

export default async function AdminDashboardPage() {
  const { branchCount, leaderCount, recentBranches } = await getDashboardStats();

  const stats = [
    { label: "Total Branches", value: branchCount ?? 0, icon: Building2, color: "var(--color-gold)" },
    { label: "Branch Leaders", value: leaderCount ?? 0, icon: Users, color: "var(--color-info)" },
    { label: "Platform Status", value: "Active", icon: Activity, color: "var(--color-success)" },
  ];

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.75rem", marginBottom: "0.25rem" }}>
          Platform Overview
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
          Manage all branches and monitor platform activity.
        </p>
      </div>

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.25rem", marginBottom: "2rem" }}>
        {stats.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card" style={{ padding: "1.5rem", display: "flex", alignItems: "center", gap: "1.25rem" }}>
            <div style={{
              width: 48, height: 48, borderRadius: "var(--radius-md)",
              background: `${color}15`,
              border: `1px solid ${color}30`,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <Icon size={22} color={color} />
            </div>
            <div>
              <div style={{ fontSize: "1.75rem", fontWeight: 700, fontFamily: "var(--font-heading)", lineHeight: 1 }}>
                {value}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>
                {label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent Branches */}
      <div className="card" style={{ padding: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1rem", fontWeight: 600 }}>
            Recent Branches
          </h2>
          <Link href="/admin/branches/new" id="new-branch-link" style={{
            background: "linear-gradient(135deg, var(--color-gold) 0%, var(--color-gold-light) 100%)",
            color: "#0D0F14",
            fontWeight: 600,
            fontSize: "0.8rem",
            padding: "0.5rem 1rem",
            borderRadius: "var(--radius-md)",
            textDecoration: "none",
          }}>
            + New Branch
          </Link>
        </div>

        {!recentBranches?.length ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--color-text-disabled)" }}>
            <Building2 size={40} style={{ marginBottom: "0.75rem", opacity: 0.4 }} />
            <p style={{ fontSize: "0.9rem" }}>No branches yet. Create your first one.</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                {["Branch Name", "Slug", "View Code", "Created"].map(h => (
                  <th key={h} style={{
                    textAlign: "left", padding: "0 0 0.75rem",
                    fontSize: "0.75rem", color: "var(--color-text-disabled)",
                    textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500,
                  }}>{h}</th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {(recentBranches as Branch[]).map((branch) => (
                <tr key={branch.id} style={{ borderBottom: "1px solid var(--color-border-subtle)" }}>
                  <td style={{ padding: "0.875rem 0", fontWeight: 600, fontSize: "0.875rem" }}>{branch.name}</td>
                  <td style={{ padding: "0.875rem 0", color: "var(--color-text-muted)", fontSize: "0.8rem" }}>{branch.slug}</td>
                  <td style={{ padding: "0.875rem 0" }}>
                    <span style={{
                      background: "rgba(201,168,76,0.1)",
                      border: "1px solid rgba(201,168,76,0.2)",
                      color: "var(--color-gold)",
                      padding: "0.2rem 0.6rem",
                      borderRadius: "var(--radius-full)",
                      fontSize: "0.78rem",
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                    }}>
                      {branch.view_code}
                    </span>
                  </td>
                  <td style={{ padding: "0.875rem 0", color: "var(--color-text-muted)", fontSize: "0.8rem" }}>
                    {formatDate(branch.created_at)}
                  </td>
                  <td style={{ padding: "0.875rem 0", textAlign: "right" }}>
                    <Link href={`/admin/branches/${branch.id}`} style={{
                      color: "var(--color-gold)", fontSize: "0.8rem", fontWeight: 500, textDecoration: "none",
                    }}>
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
