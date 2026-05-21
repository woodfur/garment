"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Trash2, Loader2, RefreshCw, Zap, Edit } from "lucide-react";
import { ZONE_POSITIONS, STANDARD_ZONES, ACCESSORY_ZONES } from "@/types/zones";
import type { BodyZone, Gender } from "@/types/database";

type UniformSummary = { id: string; name: string; image_url: string | null; bg_removed: boolean };
type ZoneItem = { id: string; zone: BodyZone; gender: Gender; uniform: UniformSummary };
type ZoneMap = Partial<Record<BodyZone, ZoneItem>>;
type PreviewStatus = "none" | "processing" | "ready" | "failed";
type ComboDetail = {
  id: string; name: string; description: string | null;
  preview_status: PreviewStatus;
  male_gif_url: string | null; female_gif_url: string | null;
  male_composite_url: string | null; female_composite_url: string | null;
  departments: { name: string } | null;
};

const POLL_INTERVAL = 5000;
const POLL_TIMEOUT  = 10 * 60 * 1000;

export default function CombinationDetailClient({ combinationId }: { combinationId: string }) {
  const router = useRouter();
  const [combo, setCombo] = useState<ComboDetail | null>(null);
  const [zones, setZones] = useState<{ male: ZoneMap; female: ZoneMap }>({ male: {}, female: {} });
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    const [comboRes, zonesRes] = await Promise.all([
      fetch(`/api/branch/combinations/${combinationId}`),
      fetch(`/api/branch/combinations/${combinationId}/zones`),
    ]);
    const [comboData, zonesData] = await Promise.all([comboRes.json(), zonesRes.json()]);
    setCombo(comboData);
    setZones(zonesData ?? { male: {}, female: {} });
    setLoading(false);
  }, [combinationId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Poll when processing
  useEffect(() => {
    if (combo?.preview_status !== "processing") return;
    const start = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - start > POLL_TIMEOUT) {
        clearInterval(pollRef.current!);
        setTimedOut(true);
        return;
      }
      const res = await fetch(`/api/branch/combinations/${combinationId}/preview-status`);
      const data = await res.json();
      setCombo((prev) => prev ? { ...prev, ...data } : prev);
      if (data.preview_status === "ready" || data.preview_status === "failed") {
        clearInterval(pollRef.current!);
      }
    }, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [combo?.preview_status, combinationId]);

  const handleDelete = async () => {
    if (!confirm(`Delete "${combo?.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    await fetch(`/api/branch/combinations/${combinationId}`, { method: "DELETE" });
    router.push("/branch/combinations");
  };

  const handleGenerate = async (force = false) => {
    setGenerating(true);
    setTimedOut(false);
    const res = await fetch(`/api/branch/combinations/${combinationId}/generate-preview`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gender: "both", force }),
    });
    if (res.ok) setCombo((prev) => prev ? { ...prev, preview_status: "processing" } : prev);
    setGenerating(false);
  };

  if (loading) return <div style={{ padding: 32 }}><Loader2 className="animate-spin" /></div>;
  if (!combo) return <div style={{ padding: 32 }}>Combination not found.</div>;

  const allZones = [...STANDARD_ZONES, ...ACCESSORY_ZONES];

  return (
    <div style={{ maxWidth: 960 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <Link href="/branch/combinations" style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--color-text-muted)", textDecoration: "none", fontSize: "0.85rem" }}>
          <ArrowLeft size={15} /> Back
        </Link>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem", marginBottom: "0.125rem" }}>{combo.name}</h1>
          {combo.departments?.name && (
            <span style={{ fontSize: "0.75rem", fontWeight: 600, padding: "0.15rem 0.5rem", borderRadius: "var(--radius-full)", background: "var(--color-primary-light)", color: "var(--color-primary-dark)" }}>
              {combo.departments.name}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <Link href={`/branch/combinations/new?edit=${combinationId}`} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "0.5rem 1rem",
            borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)", fontSize: "0.85rem", textDecoration: "none",
          }}>
            <Edit size={14} /> Edit Zones
          </Link>
          <button onClick={handleDelete} disabled={deleting} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "0.5rem 1rem",
            borderRadius: "var(--radius-md)", border: "1px solid var(--color-error)",
            color: "var(--color-error)", background: "transparent", cursor: "pointer", fontSize: "0.85rem",
          }}>
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
          </button>
        </div>
      </div>

      {/* AI Preview section */}
      <div className="card" style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.1rem" }}>AI Preview</h2>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {combo.preview_status !== "processing" && (
              <button onClick={() => handleGenerate(combo.preview_status === "ready")} disabled={generating} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "0.45rem 1rem",
                borderRadius: "var(--radius-md)", border: "1px solid var(--color-primary)",
                background: "var(--color-primary-light)", color: "var(--color-primary-dark)",
                cursor: "pointer", fontSize: "0.82rem", fontWeight: 600,
              }}>
                {generating ? <Loader2 size={13} className="animate-spin" /> :
                  combo.preview_status === "ready" ? <><RefreshCw size={13} /> Regenerate</> :
                    <><Zap size={13} /> Generate AI Preview</>}
              </button>
            )}
          </div>
        </div>

        {combo.preview_status === "ready" && combo.male_gif_url && combo.female_gif_url ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--color-text-muted)" }}>MALE</p>
              <video src={combo.male_gif_url}   autoPlay loop muted playsInline style={{ width: "100%", borderRadius: "var(--radius-md)" }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.5rem", color: "var(--color-text-muted)" }}>FEMALE</p>
              <video src={combo.female_gif_url} autoPlay loop muted playsInline style={{ width: "100%", borderRadius: "var(--radius-md)" }} />
            </div>
          </div>
        ) : combo.preview_status === "processing" ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            <Loader2 size={32} className="animate-spin" color="var(--color-primary)" style={{ margin: "0 auto 1rem" }} />
            {timedOut
              ? <p style={{ color: "var(--color-text-muted)" }}>Taking longer than expected — check back shortly.</p>
              : <p style={{ color: "var(--color-text-muted)" }}>Generating AI preview (~2–3 minutes)…</p>}
          </div>
        ) : combo.preview_status === "failed" ? (
          <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-error)" }}>
            ⚠️ Generation failed. Click "Generate AI Preview" to retry.
          </div>
        ) : (
          <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-text-muted)" }}>
            No preview generated yet. Click "Generate AI Preview" above.
          </div>
        )}
      </div>

      {/* Zone assignment table */}
      <div className="card">
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.1rem", marginBottom: "1rem" }}>Zone Assignments</h2>
        {Object.keys(zones.male).length === 0 && Object.keys(zones.female).length === 0 ? (
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            No zone assignments yet. This may be a legacy combination.{" "}
            <Link href={`/branch/combinations/new`} style={{ color: "var(--color-primary)" }}>Build a new one</Link>.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--color-text-muted)", fontWeight: 600 }}>Zone</th>
                  <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--color-text-muted)", fontWeight: 600 }}>👔 Male</th>
                  <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", color: "var(--color-text-muted)", fontWeight: 600 }}>👗 Female</th>
                </tr>
              </thead>
              <tbody>
                {allZones.map((zone) => {
                  const mItem = zones.male[zone];
                  const fItem = zones.female[zone];
                  if (!mItem && !fItem) return null;
                  return (
                    <tr key={zone} style={{ borderBottom: "1px solid var(--color-border-subtle, rgba(255,255,255,0.05))" }}>
                      <td style={{ padding: "0.6rem 0.75rem", fontWeight: 600 }}>{ZONE_POSITIONS[zone].label}</td>
                      <td style={{ padding: "0.6rem 0.75rem" }}>
                        {mItem ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            {mItem.uniform.image_url && (
                              <Image src={mItem.uniform.image_url} alt={mItem.uniform.name} width={32} height={32} style={{ borderRadius: 4, objectFit: "cover" }} />
                            )}
                            <span>{mItem.uniform.name}</span>
                            {!mItem.uniform.bg_removed && <span title="No bg removal" style={{ fontSize: "0.7rem" }}>⚠️</span>}
                          </div>
                        ) : <span style={{ color: "var(--color-text-disabled)" }}>—</span>}
                      </td>
                      <td style={{ padding: "0.6rem 0.75rem" }}>
                        {fItem ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            {fItem.uniform.image_url && (
                              <Image src={fItem.uniform.image_url} alt={fItem.uniform.name} width={32} height={32} style={{ borderRadius: 4, objectFit: "cover" }} />
                            )}
                            <span>{fItem.uniform.name}</span>
                            {!fItem.uniform.bg_removed && <span title="No bg removal" style={{ fontSize: "0.7rem" }}>⚠️</span>}
                          </div>
                        ) : <span style={{ color: "var(--color-text-disabled)" }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
