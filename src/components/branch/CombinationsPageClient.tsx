"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Layers, Trash2, Loader2, Eye } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

type Department = { id: string; name: string };
type Combination = {
  id: string; name: string; description: string | null;
  department_id: string; preview_url: string | null; created_at: string;
  departments: { name: string } | null;
};

export default function CombinationsPageClient() {
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDept, setFilterDept] = useState("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [combosRes, deptsRes] = await Promise.all([
      fetch("/api/branch/combinations"),
      fetch("/api/branch/departments"),
    ]);
    const [combos, depts] = await Promise.all([combosRes.json(), deptsRes.json()]);
    setCombinations(Array.isArray(combos) ? combos : []);
    setDepartments(Array.isArray(depts) ? depts : []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/branch/combinations/${id}`, { method: "DELETE" });
    if (res.ok) setCombinations((prev) => prev.filter((c) => c.id !== id));
    setDeletingId(null);
  }

  const filtered = combinations.filter((c) => filterDept === "all" || c.department_id === filterDept);

  if (loading) return null;

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.75rem", marginBottom: "0.25rem" }}>Combinations</h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>{filtered.length} outfit{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <Link href="/branch/combinations/new" id="build-combination-btn" style={{
          display: "inline-flex", alignItems: "center", gap: "0.5rem",
          padding: "0.65rem 1.25rem", borderRadius: "var(--radius-md)",
          background: "linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%)",
          color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: "0.875rem",
        }}>
          <Plus size={15} /> Build Combination
        </Link>
      </div>

      {/* Department filter tabs */}
      {departments.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
          {[{ id: "all", name: "All" }, ...departments].map((d) => (
            <button key={d.id} onClick={() => setFilterDept(d.id)} style={{
              padding: "0.4rem 0.875rem", borderRadius: "var(--radius-full)", fontSize: "0.82rem",
              fontWeight: filterDept === d.id ? 600 : 400, cursor: "pointer",
              background: filterDept === d.id ? "var(--color-primary-light)" : "transparent",
              color: filterDept === d.id ? "var(--color-primary-dark)" : "var(--color-text-muted)",
              border: filterDept === d.id ? "1px solid rgba(155,135,245,0.4)" : "1px solid var(--color-border)",
            }}>{d.name}</button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <div style={{ width: 64, height: 64, borderRadius: "var(--radius-lg)", background: "var(--color-primary-light)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
            <Layers size={28} color="var(--color-primary-dark)" />
          </div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.25rem", marginBottom: "0.5rem" }}>No combinations yet</h2>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", maxWidth: 340, margin: "0 auto 1.5rem" }}>
            Build your first outfit combination using the visual canvas builder.
          </p>
          <Link href="/branch/combinations/new" style={{
            display: "inline-flex", alignItems: "center", gap: "0.5rem",
            padding: "0.65rem 1.25rem", borderRadius: "var(--radius-md)",
            background: "linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%)",
            color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: "0.875rem",
          }}>
            <Plus size={15} /> Build First Combination
          </Link>
        </div>
      )}

      {/* Combinations grid */}
      {filtered.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
          {filtered.map((c) => (
            <div key={c.id} className="card" style={{ padding: 0, overflow: "hidden" }}>
              {/* Preview */}
              <div style={{ height: 200, background: "var(--color-bg-primary)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                {c.preview_url ? (
                  <Image src={c.preview_url} alt={c.name} fill style={{ objectFit: "contain", padding: "0.5rem" }} unoptimized />
                ) : (
                  <Layers size={48} color="var(--color-text-disabled)" />
                )}
              </div>
              {/* Info */}
              <div style={{ padding: "0.875rem" }}>
                <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.35rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                {c.departments?.name && (
                  <span style={{ display: "inline-block", fontSize: "0.7rem", fontWeight: 500, padding: "0.15rem 0.5rem", borderRadius: "var(--radius-full)", background: "var(--color-primary-light)", color: "var(--color-primary-dark)", marginBottom: "0.75rem" }}>
                    {c.departments.name}
                  </span>
                )}
                <div style={{ display: "flex", gap: "0.375rem" }}>
                  <Link href={`/branch/combinations/${c.id}`} style={{
                    flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem",
                    padding: "0.4rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)",
                    background: "transparent", color: "var(--color-text-muted)", fontSize: "0.75rem", textDecoration: "none",
                  }}>
                    <Eye size={12} /> View
                  </Link>
                  <button onClick={() => handleDelete(c.id)} disabled={deletingId === c.id} title="Delete"
                    style={{ padding: "0.4rem 0.6rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)", display: "flex" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-error)"; e.currentTarget.style.borderColor = "var(--color-error)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-muted)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}>
                    {deletingId === c.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
