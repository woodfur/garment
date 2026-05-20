import { createAdminClient } from "@/lib/supabase/server";
import { unstable_cache } from "next/cache";
import Link from "next/link";
import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import type { Branch } from "@/types/database";
import BranchCard from "@/components/admin/BranchCard";

// Admin pages require auth — never statically prerender
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Branches" };

const getBranchesList = unstable_cache(
  async () => {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("branches")
      .select("id, name, slug, view_code, created_at")
      .order("created_at", { ascending: false });
    return data as Branch[] | null;
  },
  ["branches-list"],
  { tags: ["branches"], revalidate: 60 }
);

export default async function BranchesPage() {
  const branches = await getBranchesList();

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.75rem", marginBottom: "0.25rem" }}>Branches</h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            {branches?.length ?? 0} branch{branches?.length !== 1 ? "es" : ""} registered
          </p>
        </div>
        <Link href="/admin/branches/new" id="create-branch-btn" style={{
          background: "linear-gradient(135deg, var(--color-gold) 0%, var(--color-gold-light) 100%)",
          color: "#0D0F14",
          fontWeight: 600,
          fontSize: "0.875rem",
          padding: "0.65rem 1.25rem",
          borderRadius: "var(--radius-md)",
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}>
          + New Branch
        </Link>
      </div>

      {/* Grid */}
      {!branches?.length ? (
        <div className="card" style={{ padding: "4rem", textAlign: "center" }}>
          <Building2 size={48} style={{ margin: "0 auto 1rem", opacity: 0.3 }} />
          <h3 style={{ fontFamily: "var(--font-heading)", marginBottom: "0.5rem" }}>No branches yet</h3>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
            Create your first branch to get started.
          </p>
          <Link href="/admin/branches/new" style={{
            background: "linear-gradient(135deg, var(--color-gold) 0%, var(--color-gold-light) 100%)",
            color: "#0D0F14", fontWeight: 600, padding: "0.65rem 1.5rem",
            borderRadius: "var(--radius-md)", textDecoration: "none", fontSize: "0.875rem",
          }}>
            Create Branch
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.25rem" }}>
          {branches.map((branch) => (
            <BranchCard key={branch.id} branch={branch} />
          ))}
        </div>
      )}
    </div>
  );
}
