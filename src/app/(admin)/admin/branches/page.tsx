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
    <div style={{ maxWidth: 1040, margin: "0 auto" }}>
      {/* Masthead */}
      <div className="dash-mast">
        <div>
          <div className="eyebrow eyebrow-accent">Administration</div>
          <div className="ttl">Branches</div>
        </div>
        <div className="issue">
          <b>{branches?.length ?? 0} {branches?.length === 1 ? "branch" : "branches"}</b><br />
          Registered on the platform
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1.5rem" }}>
        <Link href="/admin/branches/new" id="create-branch-btn" className="btn-primary" style={{ fontSize: "0.85rem", padding: "0.65rem 1.2rem", textDecoration: "none" }}>
          + New branch
        </Link>
      </div>

      {/* Grid */}
      {!branches?.length ? (
        <div className="card" style={{ padding: "4rem", textAlign: "center" }}>
          <Building2 size={48} style={{ margin: "0 auto 1rem", opacity: 0.3 }} />
          <h3 className="display-serif" style={{ fontSize: "1.4rem", marginBottom: "0.5rem" }}>No branches yet</h3>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
            Create your first branch to get started.
          </p>
          <Link href="/admin/branches/new" className="btn-primary" style={{ padding: "0.7rem 1.5rem", textDecoration: "none" }}>
            Create branch
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
