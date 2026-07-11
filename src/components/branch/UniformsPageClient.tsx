"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Shirt, Archive, ArchiveRestore, Trash2, Upload, X, Loader2, AlertTriangle, Sparkles, RefreshCw, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { UniformCategory } from "@/types/database";

type Department = { id: string; name: string };
type Uniform = {
  id: string; name: string; category: UniformCategory; department_id: string;
  image_url: string | null; raw_image_url: string | null; is_archived: boolean;
  bg_removed: boolean; storage_path: string | null; description: string | null; created_at: string;
  color: string | null; color_label: string | null;
  departments: { name: string } | null;
  _bgRemoving?: boolean; // client-only ephemeral flag
};

type PreviewStatus = "none" | "processing" | "ready" | "failed";
type Combination = {
  id: string; name: string; description: string | null;
  department_id: string; preview_url: string | null; created_at: string;
  departments: { name: string } | null;
  preview_status: PreviewStatus;
  male_gif_url: string | null;
  female_gif_url: string | null;
};
type PreviewStatusResponse = { preview_status: PreviewStatus; male_gif_url: string | null; female_gif_url: string | null };

const CATEGORIES: { value: UniformCategory; label: string }[] = [
  { value: "top",       label: "Top" },
  { value: "full_body", label: "Dress" },
  { value: "bottom",    label: "Bottom" },
  { value: "footwear",  label: "Footwear" },
  { value: "accessory", label: "Accessory" },
  { value: "outer",     label: "Outer" },
  { value: "head",      label: "Head" },
];

const CATEGORY_LABELS = Object.fromEntries(CATEGORIES.map((category) => [category.value, category.label])) as Record<UniformCategory, string>;

const POLL_INTERVAL = 5000;
const POLL_TIMEOUT = 10 * 60 * 1000;

/** Readable text colour (ink or paper) for a label sitting on a swatch. */
function textOn(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length < 6) return "#211C19";
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#211C19" : "#FBF9F4";
}

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: PreviewStatus }) {
  const map: Record<PreviewStatus, { label: string; color: string }> = {
    none: { label: "Draft", color: "var(--color-text-faint)" },
    processing: { label: "Composing", color: "var(--color-primary)" },
    ready: { label: "Ready", color: "var(--color-sage)" },
    failed: { label: "Failed", color: "var(--color-error)" },
  };
  const m = map[status];
  return (
    <span className="badge" style={{
      position: "absolute", top: "0.7rem", left: "0.7rem", zIndex: 3,
      fontSize: "0.5rem", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700,
      color: "#fff", background: m.color, padding: "0.25rem 0.5rem", borderRadius: 20,
    }}>{m.label}</span>
  );
}

// ─── A single combined look (plate with live preview) ───────────────────────────
function LookPlate({ combo, idx, onDelete, onPreviewUpdate }: {
  combo: Combination; idx: number;
  onDelete: (id: string) => void;
  onPreviewUpdate: (id: string, s: PreviewStatusResponse) => void;
}) {
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number | null>(null);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    startRef.current = Date.now();
    pollRef.current = setInterval(async () => {
      if (Date.now() - (startRef.current ?? 0) > POLL_TIMEOUT) { clearInterval(pollRef.current!); pollRef.current = null; return; }
      try {
        const res = await fetch(`/api/branch/combinations/${combo.id}/preview-status`);
        const data: PreviewStatusResponse = await res.json();
        onPreviewUpdate(combo.id, data);
        if (data.preview_status === "ready" || data.preview_status === "failed") { clearInterval(pollRef.current!); pollRef.current = null; }
      } catch { /* retry */ }
    }, POLL_INTERVAL);
  }, [combo.id, onPreviewUpdate]);

  useEffect(() => {
    if (combo.preview_status === "processing") startPolling();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [combo.preview_status, startPolling]);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!confirm(`Delete "${combo.name}"?`)) return;
    setBusy(true);
    await fetch(`/api/branch/combinations/${combo.id}`, { method: "DELETE" });
    onDelete(combo.id);
  };

  const handleGenerate = async (e: React.MouseEvent, force = false) => {
    e.preventDefault(); e.stopPropagation();
    setBusy(true);
    const res = await fetch(`/api/branch/combinations/${combo.id}/generate-preview`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gender: "both", force }),
    });
    if (res.ok) { onPreviewUpdate(combo.id, { preview_status: "processing", male_gif_url: null, female_gif_url: null }); startPolling(); }
    setBusy(false);
  };

  const gif = combo.male_gif_url ?? combo.female_gif_url;
  const ready = combo.preview_status === "ready" && gif;
  const roman = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"][idx] ?? String(idx + 1);

  return (
    <Link href={`/branch/combinations/${combo.id}`} className="plate-look ward-plate">
      <span className="no">{roman}</span>
      <StatusBadge status={combo.preview_status ?? "none"} />

      <div className="ward-plate-actions">
        {(combo.preview_status === "none" || combo.preview_status === "failed") && (
          <button onClick={(e) => handleGenerate(e, combo.preview_status === "failed")} disabled={busy} title="Generate AI preview">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          </button>
        )}
        {combo.preview_status === "ready" && (
          <button onClick={(e) => handleGenerate(e, true)} disabled={busy} title="Regenerate"><RefreshCw size={13} /></button>
        )}
        <button onClick={handleDelete} disabled={busy} title="Delete"><Trash2 size={13} /></button>
      </div>

      {ready ? (
        <video className="pl-media" src={gif!} autoPlay loop muted playsInline />
      ) : combo.preview_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="pl-media" src={combo.preview_url} alt="" />
      ) : (
        <span className="pl-initial">{combo.name.charAt(0)}</span>
      )}

      <div className="cap">
        <div className="t">{combo.name}</div>
        {combo.departments?.name && <div className="d">{combo.departments.name}</div>}
      </div>
    </Link>
  );
}

// ─── Main ───────────────────────────────────────────────────────────────────────
export default function UniformsPageClient() {
  const [view, setView] = useState<"looks" | "pieces">("looks");
  const [uniforms, setUniforms] = useState<Uniform[]>([]);
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [filterDept, setFilterDept] = useState<string>("all");

  // Upload form
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<"photo" | "color">("photo");
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState<UniformCategory>("top");
  const [formDept, setFormDept] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formPreview, setFormPreview] = useState<string | null>(null);
  const [formColor, setFormColor] = useState("#7C4E78");
  const [formColorLabel, setFormColorLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Looks + departments load once
  const fetchLooks = useCallback(async () => {
    const [combosRes, deptsRes] = await Promise.all([
      fetch("/api/branch/combinations"),
      fetch("/api/branch/departments"),
    ]);
    const [combos, depts] = await Promise.all([combosRes.json(), deptsRes.json()]);
    setCombinations(Array.isArray(combos) ? combos : []);
    setDepartments(Array.isArray(depts) ? depts : []);
    setLoading(false);
  }, []);

  // Pieces load (re-runs when archived toggle changes)
  const fetchPieces = useCallback(async () => {
    const res = await fetch(`/api/branch/uniforms?include_archived=${showArchived}`);
    const data = await res.json();
    setUniforms(Array.isArray(data) ? data : []);
  }, [showArchived]);

  useEffect(() => { fetchLooks(); }, [fetchLooks]);
  useEffect(() => { fetchPieces(); }, [fetchPieces]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormFile(file);
    setFormPreview(URL.createObjectURL(file));
    setFormError(null);
  }

  async function handleColorCreate() {
    if (!formName.trim()) { setFormError("Name is required"); return; }
    if (!formDept) { setFormError("Select a department"); return; }
    if (!/^#[0-9a-fA-F]{6}$/.test(formColor)) { setFormError("Pick a colour"); return; }

    setUploading(true);
    setFormError(null);
    try {
      const createRes = await fetch("/api/branch/uniforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(), category: formCategory, department_id: formDept,
          description: formDesc.trim() || null,
          color: formColor, color_label: formColorLabel.trim() || null,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) { setFormError(created.error ?? "Failed to save"); setUploading(false); return; }

      const dept = departments.find(d => d.id === formDept);
      const newUniform: Uniform = { ...created, departments: dept ? { name: dept.name } : null };
      setUniforms((prev) => [newUniform, ...prev]);
      resetForm();
      setUploading(false);
      setView("pieces");
    } catch (err) {
      console.error(err);
      setFormError("Failed to save. Please try again.");
      setUploading(false);
    }
  }

  async function handleUpload() {
    if (formMode === "color") return handleColorCreate();
    if (!formName.trim()) { setFormError("Name is required"); return; }
    if (!formDept) { setFormError("Select a department"); return; }
    if (!formFile) { setFormError("Upload a uniform image"); return; }

    setUploading(true);
    setFormError(null);

    try {
      const ext = formFile.name.split(".").pop() ?? "jpg";
      const storagePath = `${formDept}/${Date.now()}.${ext}`;
      const uploadRes = await fetch(`/api/branch/uniforms/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: storagePath, contentType: formFile.type }),
      });
      if (!uploadRes.ok) { setFormError("Image upload service unavailable. Please try again."); setUploading(false); return; }
      const { uploadUrl, publicUrl: rawUrl } = await uploadRes.json();

      const putRes = await fetch(uploadUrl, { method: "PUT", body: formFile, headers: { "Content-Type": formFile.type } });
      if (!putRes.ok) { setFormError("Image upload failed. Please try again."); setUploading(false); return; }

      const createRes = await fetch("/api/branch/uniforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(), category: formCategory, department_id: formDept,
          description: formDesc.trim() || null, storage_path: storagePath,
          raw_image_url: rawUrl, image_url: rawUrl, bg_removed: false,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) { setFormError(created.error ?? "Failed to save"); setUploading(false); return; }

      const dept = departments.find(d => d.id === formDept);
      const newUniform: Uniform = { ...created, storage_path: storagePath, departments: dept ? { name: dept.name } : null, _bgRemoving: true };
      setUniforms((prev) => [newUniform, ...prev]);
      resetForm();
      setUploading(false);
      setView("pieces"); // show the piece you just added

      triggerBgRemoval(created.id, storagePath);
    } catch (err) {
      console.error(err);
      setFormError("Upload failed. Please try again.");
      setUploading(false);
    }
  }

  async function triggerBgRemoval(uniformId: string, storagePath: string) {
    setUniforms((prev) => prev.map((u) => u.id === uniformId ? { ...u, _bgRemoving: true } : u));
    try {
      const res = await fetch("/api/branch/uniforms/remove-bg", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uniformId, storagePath }),
      });
      const data = await res.json();
      if (res.ok && data.image_url) {
        setUniforms((prev) => prev.map((u) => u.id === uniformId ? { ...u, image_url: data.image_url, bg_removed: true, _bgRemoving: false } : u));
      } else {
        setUniforms((prev) => prev.map((u) => u.id === uniformId ? { ...u, _bgRemoving: false } : u));
      }
    } catch {
      setUniforms((prev) => prev.map((u) => u.id === uniformId ? { ...u, _bgRemoving: false } : u));
    }
  }

  function resetForm() {
    setShowForm(false); setFormMode("photo"); setFormName(""); setFormCategory("top");
    setFormDept(""); setFormDesc(""); setFormFile(null);
    setFormPreview(null); setFormColor("#7C4E78"); setFormColorLabel("");
    setFormError(null); setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleArchive(uniform: Uniform) {
    const res = await fetch(`/api/branch/uniforms/${uniform.id}/archive`, { method: "POST" });
    if (res.ok) {
      const updated = await res.json();
      setUniforms((prev) => prev.map((u) => u.id === uniform.id ? { ...u, is_archived: updated.is_archived } : u)
        .filter((u) => showArchived || !u.is_archived));
    }
  }

  async function handleDeletePiece(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/branch/uniforms/${id}`, { method: "DELETE" });
    if (res.ok) setUniforms((prev) => prev.filter((u) => u.id !== id));
    setDeletingId(null);
  }

  const handleDeleteLook = (id: string) => setCombinations((p) => p.filter((c) => c.id !== id));
  const handlePreviewUpdate = useCallback((id: string, s: PreviewStatusResponse) => {
    setCombinations((p) => p.map((c) => c.id === id ? { ...c, ...s } : c));
  }, []);

  const looks = combinations.filter((c) => filterDept === "all" || c.department_id === filterDept);
  const pieces = uniforms.filter((u) => filterDept === "all" || u.department_id === filterDept);

  const categoryColor: Record<UniformCategory, string> = {
    top: "var(--color-primary-dark)", full_body: "var(--color-accent)",
    bottom: "var(--color-info)",
    footwear: "var(--color-sage)", accessory: "var(--color-gold-leaf)",
    outer: "var(--color-primary)", head: "var(--color-warning)",
  };

  const openUpload = () => { setShowForm(true); setFormDept(departments[0]?.id ?? ""); };

  return (
    <div style={{ maxWidth: 1040, margin: "0 auto" }}>
      {/* Masthead */}
      <div className="dash-mast">
        <div>
          <div className="eyebrow eyebrow-accent">The Wardrobe</div>
          <div className="ttl">{view === "looks" ? "Looks" : "Pieces"}</div>
        </div>
        <div className="issue">
          <b>{combinations.length} looks · {uniforms.length} pieces</b><br />
          {view === "looks" ? "Final composed results" : "Individual uniform items"}
        </div>
      </div>

      {/* Actions */}
      <div className="ward-head">
        <div className="ward-toggle">
          <button className={view === "looks" ? "on" : ""} onClick={() => setView("looks")}>Looks</button>
          <button className={view === "pieces" ? "on" : ""} onClick={() => setView("pieces")}>Pieces</button>
        </div>
        <div className="ward-actions">
          {view === "pieces" && (
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="btn-back"
              style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-full)", padding: "0.5rem 1rem", color: showArchived ? "var(--color-primary-dark)" : "var(--color-text-muted)" }}
            >
              <Archive size={14} /> {showArchived ? "Hide archived" : "Show archived"}
            </button>
          )}
          {departments.length === 0 ? (
            <Link href="/branch/departments" className="btn-secondary" style={{ padding: "0.6rem 1.1rem", fontSize: "0.82rem", textDecoration: "none" }}>
              <AlertTriangle size={14} /> Create a department first
            </Link>
          ) : (
            <>
              <button onClick={openUpload} className="btn-secondary" style={{ padding: "0.65rem 1.2rem", fontSize: "0.85rem" }}>
                <Plus size={15} /> Add uniform
              </button>
              <Link href="/branch/combinations/new" className="btn-primary" style={{ padding: "0.65rem 1.2rem", fontSize: "0.85rem", textDecoration: "none" }}>
                <Sparkles size={15} /> Compose look
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Department filter */}
      {departments.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
          {[{ id: "all", name: "All" }, ...departments].map((d) => {
            const on = filterDept === d.id;
            return (
              <button key={d.id} onClick={() => setFilterDept(d.id)} style={{
                padding: "0.4rem 0.95rem", borderRadius: "var(--radius-full)", fontSize: "0.8rem",
                fontWeight: on ? 600 : 500, cursor: "pointer",
                background: on ? "var(--color-primary-dark)" : "transparent",
                color: on ? "#fff" : "var(--color-text-muted)",
                border: on ? "1px solid var(--color-primary-dark)" : "1px solid var(--color-border)",
              }}>{d.name}</button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--color-text-faint)" }}><Loader2 size={24} className="animate-spin" style={{ margin: "0 auto" }} /></div>
      ) : view === "looks" ? (
        /* ── LOOKS (combined final results) ── */
        looks.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
            <h2 className="display-serif" style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>No looks yet</h2>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", maxWidth: 360, margin: "0 auto 1.5rem" }}>
              Compose your first look from this wardrobe&rsquo;s pieces, then let the studio render it.
            </p>
            <Link href="/branch/combinations/new" className="btn-primary" style={{ padding: "0.7rem 1.5rem", textDecoration: "none" }}>
              <Sparkles size={16} /> Compose a look
            </Link>
          </div>
        ) : (
          <div className="ward-gallery">
            {looks.map((c, i) => (
              <LookPlate key={c.id} combo={c} idx={i} onDelete={handleDeleteLook} onPreviewUpdate={handlePreviewUpdate} />
            ))}
          </div>
        )
      ) : (
        /* ── PIECES (individual uniform items) ── */
        pieces.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
            <div style={{ width: 64, height: 64, borderRadius: "var(--radius-lg)", background: "var(--color-primary-light)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
              <Shirt size={28} color="var(--color-primary-dark)" />
            </div>
            <h2 className="display-serif" style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>No pieces yet</h2>
            <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", maxWidth: 320, margin: "0 auto 1.5rem" }}>Add your first uniform item to start building looks.</p>
            {departments.length > 0 && (
              <button onClick={openUpload} className="btn-primary" style={{ padding: "0.7rem 1.5rem" }}><Plus size={16} /> Add uniform</button>
            )}
          </div>
        ) : (
          <div className="ward-gallery">
            {pieces.map((u) => (
              <div key={u.id} className="card" style={{ padding: 0, overflow: "hidden", opacity: u.is_archived ? 0.65 : 1, transition: "opacity 0.15s" }}>
                <div style={{ height: 180, background: u.color && !u.image_url ? u.color : (u.bg_removed ? "repeating-conic-gradient(#e9e3d7 0% 25%, #fbf9f4 0% 50%) 0 0 / 20px 20px" : "var(--color-bg-elevated)"), display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  {u.image_url ? (
                    <Image src={u.image_url} alt={u.name} fill style={{ objectFit: "contain", padding: "0.5rem" }} unoptimized />
                  ) : u.color ? (
                    <span style={{ color: textOn(u.color), fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", background: "rgba(0,0,0,0.12)", padding: "0.25rem 0.6rem", borderRadius: "var(--radius-full)" }}>
                      {u.color_label || u.color}
                    </span>
                  ) : (
                    <Shirt size={48} color="var(--color-text-disabled)" />
                  )}
                  {u._bgRemoving && (
                    <div style={{ position: "absolute", inset: 0, background: "rgba(33,28,25,0.45)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <Loader2 size={22} className="animate-spin" color="#fff" />
                      <span style={{ fontSize: "0.7rem", color: "#fff", fontWeight: 600 }}>Removing bg…</span>
                    </div>
                  )}
                  {!u._bgRemoving && u.bg_removed && (
                    <div style={{ position: "absolute", top: "0.5rem", left: "0.5rem", background: "var(--color-sage)", color: "#fff", fontSize: "0.6rem", fontWeight: 700, padding: "0.2rem 0.45rem", borderRadius: "var(--radius-full)", textTransform: "uppercase" }}>✓ BG removed</div>
                  )}
                  {u.is_archived && (
                    <div style={{ position: "absolute", top: "0.5rem", right: "0.5rem", background: "var(--color-warning)", color: "#fff", fontSize: "0.65rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "var(--radius-full)", textTransform: "uppercase" }}>Archived</div>
                  )}
                </div>
                <div style={{ padding: "0.875rem" }}>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.3rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</div>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "0.15rem 0.5rem", borderRadius: "var(--radius-full)", background: `${categoryColor[u.category]}20`, color: categoryColor[u.category], textTransform: "capitalize" }}>{CATEGORY_LABELS[u.category]}</span>
                    {u.departments?.name && (
                      <span style={{ fontSize: "0.7rem", fontWeight: 500, padding: "0.15rem 0.5rem", borderRadius: "var(--radius-full)", background: "var(--color-primary-light)", color: "var(--color-primary-dark)" }}>{u.departments.name}</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: "0.375rem" }}>
                    <button onClick={() => handleArchive(u)} title={u.is_archived ? "Unarchive" : "Archive"} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem", padding: "0.4rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "transparent", cursor: "pointer", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                      {u.is_archived ? <><ArchiveRestore size={12} /> Restore</> : <><Archive size={12} /> Archive</>}
                    </button>
                    <button onClick={() => handleDeletePiece(u.id)} disabled={deletingId === u.id} title="Delete" style={{ padding: "0.4rem 0.6rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)", display: "flex" }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-error)"; e.currentTarget.style.borderColor = "var(--color-error)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-muted)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}>
                      {deletingId === u.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Upload modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(33,28,25,0.5)", backdropFilter: "blur(3px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ width: "100%", maxWidth: 520, padding: "2rem", position: "relative", maxHeight: "90dvh", overflowY: "auto", background: "var(--color-bg-card)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-elevated)" }}>
            <button onClick={resetForm} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}><X size={18} /></button>
            <div className="eyebrow eyebrow-accent" style={{ marginBottom: "0.4rem" }}>The Wardrobe</div>
            <h2 className="display-serif" style={{ fontSize: "1.5rem", marginBottom: "1.25rem" }}>Add a <em className="serif-em">piece</em></h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Photo vs Colour mode */}
              <div className="gender-toggle" role="tablist" aria-label="Piece type" style={{ alignSelf: "flex-start" }}>
                <button type="button" role="tab" aria-selected={formMode === "photo"} className={formMode === "photo" ? "on" : ""} onClick={() => { setFormMode("photo"); setFormError(null); }}>📷 Photo</button>
                <button type="button" role="tab" aria-selected={formMode === "color"} className={formMode === "color" ? "on" : ""} onClick={() => { setFormMode("color"); setFormError(null); }}>🎨 Colour</button>
              </div>

              {formMode === "photo" ? (
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.4rem" }}>
                    Image <span style={{ color: "var(--color-error)" }}>*</span>
                  </label>
                  <div
                    onClick={() => fileRef.current?.click()}
                    style={{
                      border: `2px dashed ${formPreview ? "var(--color-primary-dark)" : "var(--color-border)"}`,
                      borderRadius: "var(--radius-md)", padding: "1.25rem", textAlign: "center", cursor: "pointer",
                      background: formPreview ? "var(--color-primary-light)" : "var(--color-bg-elevated)", transition: "all 0.15s",
                    }}
                  >
                    {formPreview ? (
                      <div style={{ position: "relative", width: 100, height: 100, margin: "0 auto" }}>
                        <Image src={formPreview} alt="Preview" fill style={{ objectFit: "contain" }} unoptimized />
                      </div>
                    ) : (
                      <div>
                        <Upload size={24} color="var(--color-text-faint)" style={{ margin: "0 auto 0.5rem" }} />
                        <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted)", margin: 0 }}>Click to upload image</p>
                        <p style={{ fontSize: "0.75rem", color: "var(--color-text-faint)", margin: "0.25rem 0 0" }}>PNG, JPG, WEBP</p>
                      </div>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
                </div>
              ) : (
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.4rem" }}>
                    Colour <span style={{ color: "var(--color-error)" }}>*</span>
                  </label>
                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "stretch" }}>
                    <input type="color" value={formColor} onChange={(e) => setFormColor(e.target.value)} aria-label="Pick colour"
                      style={{ width: 64, height: 48, border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", background: "none", cursor: "pointer", padding: 2, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <input value={formColorLabel} onChange={(e) => setFormColorLabel(e.target.value)} placeholder="Colour name (optional) — e.g. Baltic Sea"
                        style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.875rem", outline: "none", background: "var(--color-bg-elevated)" }} />
                      <p style={{ fontSize: "0.72rem", color: "var(--color-text-faint)", margin: "0.4rem 0 0" }}>
                        The AI renders a real garment in this colour for the category you choose.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Name <span style={{ color: "var(--color-error)" }}>*</span></label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. White Usher Shirt" style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.9rem", outline: "none", background: "var(--color-bg-elevated)" }}
                  onFocus={(e) => { e.target.style.borderColor = "var(--color-primary-dark)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--color-border)"; }} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Category <span style={{ color: "var(--color-error)" }}>*</span></label>
                  <select value={formCategory} onChange={(e) => setFormCategory(e.target.value as UniformCategory)}
                    style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.875rem", outline: "none", background: "var(--color-bg-elevated)" }}>
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Department <span style={{ color: "var(--color-error)" }}>*</span></label>
                  <select value={formDept} onChange={(e) => setFormDept(e.target.value)}
                    style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.875rem", outline: "none", background: "var(--color-bg-elevated)" }}>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Description <span style={{ color: "var(--color-text-faint)" }}>(optional)</span></label>
                <input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Brief notes about this item" style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.875rem", outline: "none", background: "var(--color-bg-elevated)" }}
                  onFocus={(e) => { e.target.style.borderColor = "var(--color-primary-dark)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--color-border)"; }} />
              </div>

              {formError && <p style={{ color: "var(--color-error)", fontSize: "0.82rem", margin: 0 }}>{formError}</p>}

              <div style={{ display: "flex", gap: "0.625rem" }}>
                <button onClick={handleUpload} disabled={uploading} className="btn-primary" style={{ flex: 1, padding: "0.75rem" }}>
                  {uploading
                    ? <><Loader2 size={15} className="animate-spin" /> Saving…</>
                    : formMode === "color" ? <>🎨 Save colour</> : <><Upload size={15} /> Upload piece</>}
                </button>
                <button onClick={resetForm} className="btn-back" style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-full)", padding: "0.75rem 1.1rem" }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
