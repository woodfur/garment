import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { formatDate } from "@/lib/utils";
import { Building2, Mail, Users } from "lucide-react";
import Link from "next/link";
import CreateLeaderForm from "@/components/admin/CreateLeaderForm";
import type { Metadata } from "next";
import type { Branch, Profile } from "@/types/database";

// Admin pages require auth — never statically prerender
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

/** Cached per-request — deduplicated between generateMetadata and the page body */
const getBranch = cache(async (branchId: string) => {
  const supabase = createAdminClient();
  const { data } = (await supabase
    .from("branches")
    .select("*")
    .eq("id", branchId)
    .single()) as unknown as { data: Branch | null };
  return data;
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { branchId } = await params;
  const branch = await getBranch(branchId);
  return { title: branch?.name ?? "Branch" };
}

export default async function BranchDetailPage({ params }: PageProps) {
  const { branchId } = await params;

  // getBranch is cached — this is a no-op if generateMetadata already called it
  const [branch, { data: leaders }] = await Promise.all([
    getBranch(branchId),
    createAdminClient().from("profiles").select("*").eq("branch_id", branchId).eq("role", "branch_leader") as unknown as Promise<{ data: Profile[] | null }>,
  ]);

  if (!branch) notFound();

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Back */}
      <Link href="/admin/branches" style={{
        display: "inline-flex", alignItems: "center", gap: "0.4rem",
        color: "var(--color-text-muted)", fontSize: "0.85rem", textDecoration: "none", marginBottom: "1.5rem",
      }}>
        ← Back to Branches
      </Link>

      {/* Branch Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", marginBottom: "2rem" }}>
        <div style={{
          width: 56, height: 56,
          background: "linear-gradient(135deg, var(--color-gold) 0%, var(--color-gold-light) 100%)",
          borderRadius: "var(--radius-lg)", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Building2 size={26} color="#FFFFFF" />
        </div>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.75rem", marginBottom: "0.2rem" }}>
            {branch.name}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>/{branch.slug}</span>
            <span style={{
              background: "rgba(155,135,245,0.1)", border: "1px solid rgba(155,135,245,0.2)",
              color: "var(--color-gold)", padding: "0.2rem 0.7rem",
              borderRadius: "var(--radius-full)", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.06em",
            }}>
              {branch.view_code}
            </span>
          </div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: "0.78rem", color: "var(--color-text-disabled)" }}>
          Created {formatDate(branch.created_at)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
        {/* Branch Leaders */}
        <div className="card" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.25rem" }}>
            <Users size={17} color="var(--color-gold)" />
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "0.95rem", fontWeight: 600 }}>
              Branch Leaders
            </h2>
          </div>

          {!leaders?.length ? (
            <p style={{ color: "var(--color-text-disabled)", fontSize: "0.85rem" }}>
              No leaders yet. Invite one below.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {leaders.map((leader) => (
                <div key={leader.id} style={{
                  display: "flex", alignItems: "center", gap: "0.75rem",
                  padding: "0.75rem", background: "var(--color-bg-surface)",
                  borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)",
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: "var(--radius-full)",
                    background: "linear-gradient(135deg, var(--color-gold) 0%, var(--color-gold-light) 100%)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 700, fontSize: "0.8rem", color: "#FFFFFF", flexShrink: 0,
                  }}>
                    {(leader.full_name || leader.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{leader.full_name || "—"}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>{leader.email}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Branch Leader */}
        <div className="card" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.25rem" }}>
            <Mail size={17} color="var(--color-gold)" />
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "0.95rem", fontWeight: 600 }}>
              Add Branch Leader
            </h2>
          </div>
          <CreateLeaderForm branchId={branch.id} branchName={branch.name} />
        </div>
      </div>
    </div>
  );
}
