"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Trash2, Loader2, RefreshCw, Sparkles, CalendarPlus, X, Download } from "lucide-react";
import { STANDARD_ZONES, ACCESSORY_ZONES, zoneLabel } from "@/types/zones";
import type { BodyZone, Gender } from "@/types/database";

/** Readable text colour (ink or paper) for a label on a colour swatch. */
function textOn(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length < 6) return "#211C19";
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#211C19" : "#FBF9F4";
}

type UniformSummary = { id: string; name: string; image_url: string | null; bg_removed: boolean; color: string | null; color_label: string | null };
type ZoneItem = { id: string; zone: BodyZone; gender: Gender; uniform: UniformSummary };
type ZoneMap = Partial<Record<BodyZone, ZoneItem>>;
type PreviewStatus = "none" | "processing" | "ready" | "failed";
type ComboDetail = {
  id: string; name: string; description: string | null;
  // Shared across departments so one render is reused rather than rebuilt.
  department_ids: string[];
  all_departments: boolean;
  gender: Gender | null;
  preview_url: string | null;
  preview_status: PreviewStatus;
  male_gif_url: string | null; female_gif_url: string | null;
  male_composite_url: string | null; female_composite_url: string | null;
  canvas_data: { mode?: string; palette?: Array<{ hex: string; label: string | null }> } | null;
};
type ScheduleOption = { id: string; service_date: string; title: string };

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
  const [activeGender, setActiveGender] = useState<Gender>("male");
  const [showAssign, setShowAssign] = useState(false);
  const [scheduleOptions, setScheduleOptions] = useState<ScheduleOption[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [assignGender, setAssignGender] = useState<Gender | "">("");
  const [assignDeptId, setAssignDeptId] = useState("");
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  // GAP-7 FIX: generationKey forces the poll useEffect to re-run when the user clicks
  // Regenerate after a timeout.
  const [generationKey, setGenerationKey] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Departments this look can be scheduled against. */
  const assignableDepartments = combo?.all_departments
    ? departments
    : departments.filter((d) => combo?.department_ids?.includes(d.id));
  const departmentLabel = assignableDepartments.map((d) => d.name).join(" · ");

  const fetchData = useCallback(async () => {
    try {
      const [comboRes, zonesRes, deptRes] = await Promise.all([
        fetch(`/api/branch/combinations/${combinationId}`),
        fetch(`/api/branch/combinations/${combinationId}/zones`),
        fetch("/api/branch/departments"),
      ]);
      if (!comboRes.ok) { setCombo(null); return; }
      const [comboData, zonesData, deptData] = await Promise.all([comboRes.json(), zonesRes.json(), deptRes.json()]);
      setCombo(comboData);
      setZones(zonesData ?? { male: {}, female: {} });
      setDepartments(Array.isArray(deptData) ? deptData : []);
    } catch {
      setCombo(null);
    } finally {
      setLoading(false);
    }
  }, [combinationId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Poll when processing
  useEffect(() => {
    if (combo?.preview_status !== "processing") return;
    const start = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - start > POLL_TIMEOUT) { clearInterval(pollRef.current!); setTimedOut(true); return; }
      try {
        const res = await fetch(`/api/branch/combinations/${combinationId}/preview-status`);
        if (!res.ok) return;
        const data = await res.json();
        setCombo((prev) => prev ? { ...prev, ...data } : prev);
        if (data.preview_status === "ready" || data.preview_status === "failed") clearInterval(pollRef.current!);
      } catch { /* retry */ }
    }, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [combo?.preview_status, combinationId, generationKey]);

  const handleDelete = async () => {
    if (!confirm(`Delete "${combo?.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/branch/combinations/${combinationId}`, { method: "DELETE" });
      if (!res.ok) { const data = await res.json().catch(() => ({})); alert(data.error ?? "Failed to delete. Please try again."); return; }
      router.push("/branch/uniforms");
    } catch {
      alert("Network error — failed to delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const handleGenerate = async (force = false) => {
    setGenerating(true);
    setTimedOut(false);
    setGenerationKey((k) => k + 1);
    try {
      const res = await fetch(`/api/branch/combinations/${combinationId}/generate-preview`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gender: combo?.gender ?? "both", force }),
      });
      if (res.ok) setCombo((prev) => prev ? { ...prev, preview_status: "processing" } : prev);
      else { const data = await res.json().catch(() => ({})); alert(data.error ?? "Failed to start AI preview. Please try again."); }
    } catch {
      alert("Network error — failed to generate preview. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  async function openAssign() {
    if (!combo) return;
    setShowAssign(true);
    setAssignError(null);
    setSelectedScheduleId("");
    setAssignGender(combo?.gender ?? "");
    // A shared look serves several departments, so the target must be chosen.
    setAssignDeptId(assignableDepartments.length === 1 ? assignableDepartments[0].id : "");
    try {
      const res = await fetch("/api/branch/schedules");
      const data = await res.json();
      const today = new Date().toISOString().split("T")[0];
      const list = Array.isArray(data)
        ? data.filter((s) => s.service_date >= today).map((s) => ({ id: s.id, service_date: s.service_date, title: s.title }))
        : [];
      setScheduleOptions(list);
      setSelectedScheduleId(list[0]?.id ?? "");
    } catch {
      setAssignError("Failed to load services");
    }
  }

  async function handleAssign() {
    if (!combo || !selectedScheduleId) return;
    const gender = combo.gender ?? assignGender;
    if (!gender) {
      setAssignError("Choose a gender before assigning this look");
      return;
    }
    if (!assignDeptId) {
      setAssignError("Choose which department this look is for");
      return;
    }
    setAssigning(true);
    setAssignError(null);
    try {
      const res = await fetch(`/api/branch/schedules/${selectedScheduleId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department_id: assignDeptId,
          combination_id: combo.id,
          gender,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setAssignError(data.error ?? "Failed to assign look"); return; }
      setShowAssign(false);
    } catch {
      setAssignError("Failed to assign look. Please try again.");
    } finally {
      setAssigning(false);
    }
  }

  if (loading) return <div style={{ display: "grid", placeItems: "center", padding: "4rem", color: "var(--color-text-faint)" }}><Loader2 size={24} className="animate-spin" /></div>;
  if (!combo) return (
    <div style={{ textAlign: "center", padding: "4rem 2rem", maxWidth: 960, margin: "0 auto" }}>
      <h1 className="display-serif" style={{ fontSize: "1.6rem", marginBottom: "0.5rem" }}>Look not found</h1>
      <Link href="/branch/uniforms" className="btn-primary" style={{ padding: "0.65rem 1.3rem", textDecoration: "none", marginTop: "1rem" }}>← Back to wardrobe</Link>
    </div>
  );

  const allZones = [...STANDARD_ZONES, ...ACCESSORY_ZONES];
  const isPaletteLook = combo.canvas_data?.mode === "palette";
  const paletteColors = combo.canvas_data?.palette ?? [];
  const displayGender = combo.gender ?? activeGender;
  const hasCompositePreview = !!(combo.male_composite_url || combo.female_composite_url);
  const hasVideoPreview = !!(combo.male_gif_url || combo.female_gif_url);
  const hasDownloadForGender = (g: Gender) =>
    !!(g === "male"
      ? combo.male_composite_url || combo.male_gif_url
      : combo.female_composite_url || combo.female_gif_url);
  const activeZoneList = allZones
    .map((zone) => ({ zone, item: zones[displayGender][zone] }))
    .filter((z) => z.item);
  const genderHasAny = (g: Gender) => Object.keys(zones[g]).length > 0;

  return (
    <div style={{ maxWidth: 960, margin: "0 auto" }}>
      {/* Back */}
      <Link href="/branch/uniforms" style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--color-text-muted)", textDecoration: "none", fontSize: "0.82rem", fontWeight: 600, marginBottom: "1rem" }}>
        <ArrowLeft size={15} /> Back to wardrobe
      </Link>

      {/* Masthead */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", paddingBottom: "0.875rem", marginBottom: "1.75rem", borderBottom: "1.5px solid var(--color-text-primary)" }}>
        <div>
          <div className="eyebrow eyebrow-accent">{departmentLabel || "A look"}</div>
          <h1 className="display-serif" style={{ fontSize: "2.4rem", marginTop: "0.3rem" }}>{combo.name}</h1>
          {combo.description && <p style={{ fontSize: "0.85rem", color: "var(--color-text-muted)", marginTop: "0.4rem", maxWidth: "52ch" }}>{combo.description}</p>}
        </div>
        <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
          <button onClick={openAssign} className="btn-primary" style={{ padding: "0.55rem 1.1rem" }}>
            <CalendarPlus size={14} /> Assign to service
          </button>
          <button onClick={handleDelete} disabled={deleting} className="btn-back" style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-full)", padding: "0.55rem 1.1rem", color: "var(--color-error)" }}>
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
          </button>
        </div>
      </div>

      {/* The render */}
      <section style={{ marginBottom: "2.5rem" }}>
        <div className="dash-sec" style={{ padding: "0 0 1.1rem" }}>
          <div className="lt"><span className="num">01</span><h2>The <em>render</em></h2></div>
          {!isPaletteLook && combo.preview_status !== "processing" && (
            <button onClick={() => handleGenerate(combo.preview_status === "ready")} disabled={generating}
              className="btn-primary" style={{ padding: "0.5rem 1.1rem", fontSize: "0.8rem" }}>
              {generating ? <Loader2 size={13} className="animate-spin" /> :
                combo.preview_status === "ready" ? <><RefreshCw size={13} /> Regenerate</> :
                  <><Sparkles size={13} /> Generate AI preview</>}
            </button>
          )}
        </div>

        {isPaletteLook && combo.preview_status === "ready" && combo.preview_url ? (
          <div style={{ maxWidth: 720 }}>
            <Image
              src={combo.preview_url}
              alt={combo.name}
              width={1200}
              height={1400}
              style={{ width: "100%", height: "auto", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", background: "var(--color-bg-board)" }}
              unoptimized
            />
            {combo.gender && hasDownloadForGender(combo.gender) && (
              <a
                href={`/api/branch/combinations/${combo.id}/download?gender=${combo.gender}`}
                className="btn-primary"
                style={{ display: "inline-flex", marginTop: "0.8rem", padding: "0.55rem 1.1rem", textDecoration: "none" }}
              >
                <Download size={14} /> Download render
              </a>
            )}
          </div>
        ) : combo.preview_status === "ready" && hasCompositePreview ? (
          <div style={{ display: "grid", gridTemplateColumns: combo.male_composite_url && combo.female_composite_url ? "1fr 1fr" : "1fr", gap: "1.25rem", maxWidth: combo.male_composite_url && combo.female_composite_url ? "none" : 420 }}>
            {(["male", "female"] as Gender[]).map((g) => {
              const image = g === "male" ? combo.male_composite_url : combo.female_composite_url;
              if (!image) return null;
              return (
                <div key={g}>
                  <div className="rule-label" style={{ marginBottom: "0.6rem" }}><span>{g === "male" ? "Male" : "Female"}</span><span className="rule" /></div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt={`${combo.name} ${g} preview`} style={{ width: "100%", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", background: "var(--color-bg-board)" }} />
                  <a
                    href={`/api/branch/combinations/${combo.id}/download?gender=${g}`}
                    className="btn-primary"
                    style={{ display: "inline-flex", marginTop: "0.65rem", padding: "0.5rem 1rem", fontSize: "0.8rem", textDecoration: "none" }}
                  >
                    <Download size={13} /> Download
                  </a>
                </div>
              );
            })}
          </div>
        ) : combo.preview_status === "ready" && hasVideoPreview ? (
          <div style={{ display: "grid", gridTemplateColumns: combo.male_gif_url && combo.female_gif_url ? "1fr 1fr" : "1fr", gap: "1.25rem", maxWidth: combo.male_gif_url && combo.female_gif_url ? "none" : 340 }}>
            {(["male", "female"] as Gender[]).map((g) => {
              const gif = g === "male" ? combo.male_gif_url : combo.female_gif_url;
              if (!gif) return null;
              return (
                <div key={g}>
                  <div className="rule-label" style={{ marginBottom: "0.6rem" }}><span>{g === "male" ? "Male" : "Female"}</span><span className="rule" /></div>
                  <video src={gif} autoPlay loop muted playsInline style={{ width: "100%", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", background: "var(--color-bg-board)" }} />
                  <a
                    href={`/api/branch/combinations/${combo.id}/download?gender=${g}`}
                    className="btn-primary"
                    style={{ display: "inline-flex", marginTop: "0.65rem", padding: "0.5rem 1rem", fontSize: "0.8rem", textDecoration: "none" }}
                  >
                    <Download size={13} /> Download
                  </a>
                </div>
              );
            })}
          </div>
        ) : combo.preview_status === "processing" ? (
          <div className="card" style={{ padding: "3rem 2rem", textAlign: "center" }}>
            <Loader2 size={30} className="animate-spin" color="var(--color-primary-dark)" style={{ margin: "0 auto 1rem" }} />
            <p style={{ color: "var(--color-text-muted)" }}>
              {timedOut ? "Taking longer than expected — check back shortly." : "Composing the look (~2–3 minutes)…"}
            </p>
          </div>
        ) : combo.preview_status === "failed" ? (
          <div className="card" style={{ padding: "2rem", textAlign: "center", color: "var(--color-error)" }}>
            ⚠️ Generation failed. Use “Generate AI preview” to retry.
          </div>
        ) : (
          <div className="card" style={{ padding: "2.5rem 2rem", textAlign: "center" }}>
            <p className="display-serif" style={{ fontSize: "1.2rem", marginBottom: "0.35rem" }}>Not rendered yet</p>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.88rem" }}>Generate the AI preview to see this look come to life.</p>
          </div>
        )}
      </section>

      {/* Zone assignments — the pieces in this look */}
      <section>
        <div className="dash-sec" style={{ padding: "0 0 1.1rem" }}>
          <div className="lt"><span className="num">02</span><h2>The <em>pieces</em></h2></div>
        </div>

        {isPaletteLook ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.75rem" }}>
            {paletteColors.map((color) => (
              <div key={color.hex} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ height: 110, background: color.hex, display: "grid", placeItems: "center" }}>
                  <span style={{ color: textOn(color.hex), fontSize: "0.72rem", fontWeight: 800, background: "rgba(0,0,0,0.12)", padding: "0.2rem 0.55rem", borderRadius: "var(--radius-full)" }}>{color.hex}</span>
                </div>
                <div style={{ padding: "0.75rem" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>{color.label || color.hex}</div>
                  <div style={{ color: "var(--color-text-faint)", fontSize: "0.75rem", marginTop: 2 }}>{color.hex}</div>
                </div>
              </div>
            ))}
          </div>
        ) : !genderHasAny("male") && !genderHasAny("female") ? (
          <div className="card" style={{ padding: "2rem", color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            No pieces recorded for this look. <Link href="/branch/combinations/new" style={{ color: "var(--color-primary-dark)", fontWeight: 600 }}>Build a new one →</Link>
          </div>
        ) : (
          <>
            {!combo.gender && (
              <div className="gender-toggle">
                <button className={activeGender === "male" ? "on" : ""} onClick={() => setActiveGender("male")}>♂ Male</button>
                <button className={activeGender === "female" ? "on" : ""} onClick={() => setActiveGender("female")}>♀ Female</button>
              </div>
            )}

            {activeZoneList.length === 0 ? (
              <div className="card" style={{ marginTop: "0.5rem" }}>
                <p style={{ padding: "1.5rem", textAlign: "center", color: "var(--color-text-muted)", fontSize: "0.88rem" }}>
                  No pieces assigned to this look.
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "1rem", marginTop: "0.5rem" }}>
                {activeZoneList.map(({ zone, item }) => (
                  <div key={zone} className="card" style={{ padding: 0, overflow: "hidden" }}>
                    <div style={{ position: "relative", aspectRatio: "1", background: item!.uniform?.color && !item!.uniform?.image_url ? item!.uniform.color : (item!.uniform?.bg_removed ? "repeating-conic-gradient(#e9e3d7 0% 25%, #fbf9f4 0% 50%) 0 0 / 16px 16px" : "var(--color-bg-elevated)"), borderBottom: "1px solid var(--color-border)", display: "grid", placeItems: "center" }}>
                      {item!.uniform?.image_url ? (
                        <Image src={item!.uniform.image_url} alt={item!.uniform.name} fill style={{ objectFit: "contain", padding: "0.75rem" }} unoptimized />
                      ) : item!.uniform?.color ? (
                        <span style={{ fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: textOn(item!.uniform.color), background: "rgba(0,0,0,0.12)", padding: "0.2rem 0.5rem", borderRadius: 999 }}>{item!.uniform.color_label || item!.uniform.color}</span>
                      ) : (
                        <span style={{ fontFamily: "var(--font-heading)", fontStyle: "italic", fontSize: "2rem", color: "var(--color-text-faint)" }}>{item!.uniform?.name?.[0] ?? "?"}</span>
                      )}
                      {item!.uniform?.image_url && !item!.uniform.bg_removed && (
                        <span title="Background not removed" style={{ position: "absolute", top: "0.5rem", right: "0.5rem", fontSize: "0.85rem" }}>⚠️</span>
                      )}
                    </div>
                    <div style={{ padding: "0.7rem 0.8rem" }}>
                      <div style={{ fontSize: "0.55rem", letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--color-text-faint)", fontWeight: 700 }}>{zoneLabel(zone, activeGender)}</div>
                      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: "0.95rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2 }}>
                        {item!.uniform?.name ?? "[Uniform deleted]"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {showAssign && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(33,28,25,0.5)", backdropFilter: "blur(3px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div className="card" style={{ width: "100%", maxWidth: 460, padding: "1.75rem", position: "relative" }}>
            <button onClick={() => setShowAssign(false)} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}><X size={18} /></button>
            <div className="eyebrow eyebrow-accent" style={{ marginBottom: "0.4rem" }}>{departmentLabel || "Look"}</div>
            <h2 className="display-serif" style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Assign <em className="serif-em">{combo.name}</em></h2>
            <div style={{ display: "grid", gap: "0.9rem" }}>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Service</label>
                <select value={selectedScheduleId} onChange={(e) => setSelectedScheduleId(e.target.value)} style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.875rem", outline: "none", background: "var(--color-bg-elevated)" }}>
                  {scheduleOptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.service_date} - {s.title}</option>
                  ))}
                </select>
              </div>
              {assignableDepartments.length > 1 && (
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Department</label>
                  <select value={assignDeptId} onChange={(e) => setAssignDeptId(e.target.value)} style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.875rem", outline: "none", background: "var(--color-bg-elevated)" }}>
                    <option value="">Select department...</option>
                    {assignableDepartments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {!combo.gender && (
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Gender</label>
                  <select value={assignGender} onChange={(e) => setAssignGender(e.target.value as Gender | "")} style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.875rem", outline: "none", background: "var(--color-bg-elevated)" }}>
                    <option value="">Select gender...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              )}
              {assignError && <p style={{ color: "var(--color-error)", fontSize: "0.82rem", margin: 0 }}>{assignError}</p>}
              <button onClick={handleAssign} disabled={assigning || !selectedScheduleId || !assignDeptId || !(combo.gender ?? assignGender)} className="btn-primary" style={{ padding: "0.75rem" }}>
                {assigning ? <><Loader2 size={15} className="animate-spin" /> Assigning...</> : <><CalendarPlus size={15} /> Assign to service</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
