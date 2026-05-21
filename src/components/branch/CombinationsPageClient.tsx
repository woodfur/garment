"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Layers, Trash2, Loader2, Eye, RefreshCw, Zap } from "lucide-react";
import Link from "next/link";
import Image from "next/image";

type Department = { id: string; name: string };
type PreviewStatus = "none" | "processing" | "ready" | "failed";
type Combination = {
  id: string; name: string; description: string | null;
  department_id: string; preview_url: string | null; created_at: string;
  departments: { name: string } | null;
  preview_status: PreviewStatus;
  male_gif_url: string | null;
  female_gif_url: string | null;
};

type PreviewStatusResponse = {
  preview_status: PreviewStatus;
  male_gif_url: string | null;
  female_gif_url: string | null;
};

const POLL_INTERVAL = 5000;
const POLL_TIMEOUT  = 10 * 60 * 1000; // 10 min

function PreviewStatusBadge({ status }: { status: PreviewStatus }) {
  const map: Record<PreviewStatus, { label: string; color: string; bg: string }> = {
    none:       { label: "No Preview",  color: "var(--color-text-muted)",    bg: "transparent" },
    processing: { label: "Generating…", color: "var(--color-primary-dark)",  bg: "var(--color-primary-light)" },
    ready:      { label: "Preview Ready", color: "#22c55e",                  bg: "rgba(34,197,94,0.12)" },
    failed:     { label: "Failed",       color: "var(--color-error)",         bg: "rgba(239,68,68,0.1)" },
  };
  const m = map[status];
  return (
    <span style={{
      display: "inline-block", fontSize: "0.68rem", fontWeight: 600, padding: "0.15rem 0.5rem",
      borderRadius: "var(--radius-full)", color: m.color, background: m.bg, border: `1px solid ${m.color}33`,
    }}>{m.label}</span>
  );
}

function CombinationCard({
  combo, onDelete, onPreviewUpdate,
}: {
  combo: Combination;
  onDelete: (id: string) => void;
  onPreviewUpdate: (id: string, status: PreviewStatusResponse) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number | null>(null);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    startRef.current = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - (startRef.current ?? 0) > POLL_TIMEOUT) {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setTimedOut(true);
        return;
      }
      try {
        const res = await fetch(`/api/branch/combinations/${combo.id}/preview-status`);
        const data: PreviewStatusResponse = await res.json();
        onPreviewUpdate(combo.id, data);
        if (data.preview_status === "ready" || data.preview_status === "failed") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
        }
      } catch { /* ignore */ }
    }, POLL_INTERVAL);
  }, [combo.id, onPreviewUpdate]);

  useEffect(() => {
    if (combo.preview_status === "processing") startPolling();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [combo.preview_status, startPolling]);

  const handleDelete = async () => {
    setDeleting(true);
    await fetch(`/api/branch/combinations/${combo.id}`, { method: "DELETE" });
    onDelete(combo.id);
  };

  const handleGeneratePreview = async (force = false) => {
    setGenerating(true);
    setTimedOut(false);
    const res = await fetch(`/api/branch/combinations/${combo.id}/generate-preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gender: "both", force }),
    });
    if (res.ok) {
      onPreviewUpdate(combo.id, { preview_status: "processing", male_gif_url: null, female_gif_url: null });
      startPolling();
    }
    setGenerating(false);
  };

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Preview area */}
      <div style={{ background: "var(--color-bg-primary)", position: "relative", minHeight: 180 }}>
        {combo.preview_status === "ready" && combo.male_gif_url && combo.female_gif_url ? (
          <div style={{ display: "flex", gap: 4 }}>
            <video src={combo.male_gif_url}    autoPlay loop muted playsInline style={{ width: "50%", height: 180, objectFit: "cover" }} />
            <video src={combo.female_gif_url}  autoPlay loop muted playsInline style={{ width: "50%", height: 180, objectFit: "cover" }} />
          </div>
        ) : combo.preview_status === "processing" ? (
          <div style={{ height: 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <Loader2 size={28} className="animate-spin" color="var(--color-primary)" />
            {timedOut ? (
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textAlign: "center", maxWidth: 160 }}>
                Taking longer than expected — refresh the page or check back shortly.
              </p>
            ) : (
              <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Generating… (~2–3 min)</p>
            )}
          </div>
        ) : combo.preview_url ? (
          <Image src={combo.preview_url} alt={combo.name} fill style={{ objectFit: "contain", padding: "0.5rem" }} unoptimized />
        ) : (
          <div style={{ height: 180, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Layers size={40} color="var(--color-text-disabled)" />
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "0.875rem", flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        <div style={{ fontWeight: 600, fontSize: "0.875rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {combo.name}
        </div>

        <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
          {combo.departments?.name && (
            <span style={{ fontSize: "0.7rem", fontWeight: 500, padding: "0.15rem 0.5rem", borderRadius: "var(--radius-full)", background: "var(--color-primary-light)", color: "var(--color-primary-dark)" }}>
              {combo.departments.name}
            </span>
          )}
          <PreviewStatusBadge status={combo.preview_status ?? "none"} />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "0.375rem", marginTop: "auto", flexWrap: "wrap" }}>
          <Link href={`/branch/combinations/${combo.id}`} style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem",
            padding: "0.4rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)",
            color: "var(--color-text-muted)", fontSize: "0.75rem", textDecoration: "none",
          }}>
            <Eye size={12} /> View
          </Link>

          {(combo.preview_status === "none" || combo.preview_status === "failed") && (
            <button
              onClick={() => handleGeneratePreview(combo.preview_status === "failed")}
              disabled={generating}
              title="Generate AI Preview"
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem",
                padding: "0.4rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-primary)",
                background: "var(--color-primary-light)", color: "var(--color-primary-dark)", fontSize: "0.75rem", cursor: "pointer" }}
            >
              {generating ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              {combo.preview_status === "failed" ? "Retry" : "Generate"}
            </button>
          )}

          {combo.preview_status === "ready" && (
            <button
              onClick={() => handleGeneratePreview(true)}
              disabled={generating}
              title="Regenerate"
              style={{ padding: "0.4rem 0.6rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)", display: "flex" }}
            >
              <RefreshCw size={13} />
            </button>
          )}

          <button onClick={handleDelete} disabled={deleting} title="Delete"
            style={{ padding: "0.4rem 0.6rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)", display: "flex" }}>
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CombinationsPageClient() {
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDept, setFilterDept] = useState("all");

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

  const handleDelete = (id: string) => setCombinations((prev) => prev.filter((c) => c.id !== id));

  const handlePreviewUpdate = useCallback((id: string, status: PreviewStatusResponse) => {
    setCombinations((prev) => prev.map((c) => c.id === id ? { ...c, ...status } : c));
  }, []);

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
            Build your first outfit combination using the zone-based mannequin builder.
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem" }}>
          {filtered.map((c) => (
            <CombinationCard
              key={c.id}
              combo={c}
              onDelete={handleDelete}
              onPreviewUpdate={handlePreviewUpdate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
