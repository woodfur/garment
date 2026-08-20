"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Shirt, Archive, ArchiveRestore, Trash2, Upload, X, Loader2, AlertTriangle, Sparkles, RefreshCw, ChevronRight, Edit3, MoreHorizontal, CalendarPlus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { Gender, UniformCategory } from "@/types/database";
import { PieceScopeFields, type PieceScopeValue } from "./PieceScopeFields";
import { isOrphaned, matchesDepartment } from "@/lib/scope";

type Department = { id: string; name: string };
type Uniform = {
  id: string; name: string; category: UniformCategory;
  // A piece may serve several departments and both genders.
  department_ids: string[]; all_departments: boolean; genders: Gender[];
  image_url: string | null; raw_image_url: string | null; is_archived: boolean;
  bg_removed: boolean; storage_path: string | null; description: string | null; created_at: string;
  color: string | null; color_label: string | null;
  _bgRemoving?: boolean; // client-only ephemeral flag
  _bgError?: string; // client-only ephemeral flag
};

type PreviewStatus = "none" | "processing" | "ready" | "failed";
type Combination = {
  id: string; name: string; description: string | null;
  department_id: string; gender: Gender | null; canvas_data: Record<string, unknown> | null; preview_url: string | null; created_at: string;
  departments: { name: string } | null;
  preview_status: PreviewStatus;
  male_composite_url: string | null;
  female_composite_url: string | null;
  male_gif_url: string | null;
  female_gif_url: string | null;
};
type PreviewStatusResponse = {
  preview_url: string | null;
  preview_status: PreviewStatus;
  male_composite_url: string | null;
  female_composite_url: string | null;
  male_gif_url: string | null;
  female_gif_url: string | null;
};
type ScheduleOption = { id: string; service_date: string; title: string };

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
    <span style={{
      display: "inline-flex", width: "fit-content", marginBottom: "0.35rem",
      fontSize: "0.5rem", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700,
      color: "#fff", background: m.color, padding: "0.25rem 0.5rem", borderRadius: 20,
    }}>{m.label}</span>
  );
}

// ─── A single combined look (plate with live preview) ───────────────────────────
function LookPlate({ combo, idx, onDelete, onPreviewUpdate, onAssign }: {
  combo: Combination; idx: number;
  onDelete: (id: string) => void;
  onPreviewUpdate: (id: string, s: PreviewStatusResponse) => void;
  onAssign: (combo: Combination) => void;
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
      body: JSON.stringify({ gender: combo.gender ?? "both", force }),
    });
    if (res.ok) {
      onPreviewUpdate(combo.id, {
        preview_url: combo.preview_url,
        preview_status: "processing",
        male_composite_url: null,
        female_composite_url: null,
        male_gif_url: null,
        female_gif_url: null,
      });
      startPolling();
    }
    setBusy(false);
  };

  const image = combo.preview_url ?? combo.male_composite_url ?? combo.female_composite_url;
  const gif = combo.male_gif_url ?? combo.female_gif_url;
  const ready = combo.preview_status === "ready" && (image || gif);
  const roman = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"][idx] ?? String(idx + 1);

  return (
    <Link href={`/branch/combinations/${combo.id}`} className="plate-look ward-plate">
      <span className="no">{roman}</span>

      <div className="ward-plate-actions">
        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAssign(combo); }} disabled={busy} title="Assign to service">
          <CalendarPlus size={13} />
        </button>
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

      {ready && image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="pl-media" src={image} alt={combo.name} />
      ) : ready && gif ? (
        <video className="pl-media" src={gif!} autoPlay loop muted playsInline />
      ) : combo.preview_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="pl-media" src={combo.preview_url} alt="" />
      ) : (
        <span className="pl-initial">{combo.name.charAt(0)}</span>
      )}

      <div className="cap">
        <StatusBadge status={combo.preview_status ?? "none"} />
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
  const [showCreateLook, setShowCreateLook] = useState(false);

  // Upload form
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState<UniformCategory>("top");
  const [formScope, setFormScope] = useState<PieceScopeValue>({
    departmentIds: [], allDepartments: false, genders: ["female"],
  });
  const [formDesc, setFormDesc] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formPreview, setFormPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingPiece, setEditingPiece] = useState<Uniform | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [assigningLook, setAssigningLook] = useState<Combination | null>(null);
  const [scheduleOptions, setScheduleOptions] = useState<ScheduleOption[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [assignGender, setAssignGender] = useState<Gender | "">("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

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

  async function handleUpload() {
    if (!formName.trim()) { setFormError("Name is required"); return; }
    if (!formScope.allDepartments && formScope.departmentIds.length === 0) {
      setFormError("Select at least one department, or choose All departments"); return;
    }
    if (formScope.genders.length === 0) { setFormError("Select at least one gender"); return; }
    if (!formFile) { setFormError("Upload a uniform image"); return; }

    setUploading(true);
    setFormError(null);

    try {
      const ext = formFile.name.split(".").pop() ?? "jpg";
      // Shared pieces have no single owning department — group uploads by branch instead.
      const storagePath = `pieces/${Date.now()}.${ext}`;
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
          name: formName.trim(), category: formCategory,
          department_ids: formScope.departmentIds,
          all_departments: formScope.allDepartments,
          genders: formScope.genders,
          description: formDesc.trim() || null, storage_path: storagePath,
          raw_image_url: rawUrl, image_url: rawUrl, bg_removed: false,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) { setFormError(created.error ?? "Failed to save"); setUploading(false); return; }

      const newUniform: Uniform = { ...created, storage_path: storagePath, _bgRemoving: true };
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
        setUniforms((prev) => prev.map((u) => u.id === uniformId ? { ...u, _bgRemoving: false, _bgError: data.error ?? "Background removal failed" } : u));
      }
    } catch {
      setUniforms((prev) => prev.map((u) => u.id === uniformId ? { ...u, _bgRemoving: false, _bgError: "Background removal failed" } : u));
    }
  }

  function resetForm() {
    setShowForm(false); setFormName(""); setFormCategory("top");
    setFormScope({ departmentIds: [], allDepartments: false, genders: ["female"] });
    setFormDesc(""); setFormFile(null);
    setFormPreview(null);
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

  function openEditPiece(uniform: Uniform) {
    setEditingPiece(uniform);
    setEditError(null);
  }

  async function handleSaveEdit() {
    if (!editingPiece) return;
    if (!editingPiece.name.trim()) { setEditError("Name is required"); return; }
    if (!editingPiece.all_departments && editingPiece.department_ids.length === 0) {
      setEditError("Select at least one department, or choose All departments"); return;
    }
    if (editingPiece.genders.length === 0) { setEditError("Select at least one gender"); return; }

    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/branch/uniforms/${editingPiece.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingPiece.name.trim(),
          category: editingPiece.category,
          department_ids: editingPiece.department_ids,
          all_departments: editingPiece.all_departments,
          genders: editingPiece.genders,
          description: editingPiece.description?.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error ?? "Failed to save"); return; }

      setUniforms((prev) => prev.map((u) => u.id === data.id ? { ...u, ...data } : u));
      setEditingPiece(null);
    } catch {
      setEditError("Failed to save. Please try again.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function openAssignLook(combo: Combination) {
    setAssigningLook(combo);
    setAssignError(null);
    setSelectedScheduleId("");
    setAssignGender(combo.gender ?? "");
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

  async function handleAssignLook() {
    if (!assigningLook || !selectedScheduleId) return;
    const gender = assigningLook.gender ?? assignGender;
    if (!gender) {
      setAssignError("Choose a gender before assigning this look");
      return;
    }
    setAssigning(true);
    setAssignError(null);
    try {
      const res = await fetch(`/api/branch/schedules/${selectedScheduleId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          department_id: assigningLook.department_id,
          combination_id: assigningLook.id,
          gender,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setAssignError(data.error ?? "Failed to assign look"); return; }
      setAssigningLook(null);
    } catch {
      setAssignError("Failed to assign look. Please try again.");
    } finally {
      setAssigning(false);
    }
  }

  const handleDeleteLook = (id: string) => setCombinations((p) => p.filter((c) => c.id !== id));
  const handlePreviewUpdate = useCallback((id: string, s: PreviewStatusResponse) => {
    setCombinations((p) => p.map((c) => c.id === id ? { ...c, ...s } : c));
  }, []);

  const looks = combinations.filter((c) => filterDept === "all" || c.department_id === filterDept);
  // Shared pieces appear under every department they serve.
  const pieces = uniforms.filter((u) => filterDept === "all" || matchesDepartment(u, filterDept));

  const departmentNames = (piece: Uniform) =>
    piece.department_ids
      .map((id) => departments.find((d) => d.id === id)?.name)
      .filter((name): name is string => !!name);

  const categoryColor: Record<UniformCategory, string> = {
    top: "var(--color-primary-dark)", full_body: "var(--color-accent)",
    bottom: "var(--color-info)",
    footwear: "var(--color-sage)", accessory: "var(--color-gold-leaf)",
    outer: "var(--color-primary)", head: "var(--color-warning)",
  };

  const openUpload = () => {
    setShowForm(true);
    // Preselect whichever department is being filtered, so the common single-department
    // case stays one click. "All" is never preselected — that has to be deliberate.
    setFormScope({
      departmentIds: filterDept !== "all" ? [filterDept] : [],
      allDepartments: false,
      genders: ["female"],
    });
  };

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
                <Plus size={15} /> Add piece
              </button>
              <button onClick={() => setShowCreateLook(true)} className="btn-primary" style={{ padding: "0.65rem 1.2rem", fontSize: "0.85rem" }}>
                <Sparkles size={15} /> Create look
              </button>
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
            <button onClick={() => setShowCreateLook(true)} className="btn-primary" style={{ padding: "0.7rem 1.5rem" }}>
              <Sparkles size={16} /> Create look
            </button>
          </div>
        ) : (
          <div className="ward-gallery">
            {looks.map((c, i) => (
              <LookPlate key={c.id} combo={c} idx={i} onDelete={handleDeleteLook} onPreviewUpdate={handlePreviewUpdate} onAssign={openAssignLook} />
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
                  {u._bgError && (
                    <div style={{ position: "absolute", left: "0.5rem", right: "0.5rem", bottom: "0.5rem", background: "var(--color-error-bg)", color: "var(--color-error)", fontSize: "0.65rem", fontWeight: 700, padding: "0.35rem 0.5rem", borderRadius: "var(--radius-md)" }}>
                      {u._bgError}
                    </div>
                  )}
                  {u.is_archived && (
                    <div style={{ position: "absolute", top: "0.5rem", right: "0.5rem", background: "var(--color-warning)", color: "#fff", fontSize: "0.65rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "var(--radius-full)", textTransform: "uppercase" }}>Archived</div>
                  )}
                </div>
                <div style={{ padding: "0.875rem" }}>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.3rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</div>
                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "0.15rem 0.5rem", borderRadius: "var(--radius-full)", background: `${categoryColor[u.category]}20`, color: categoryColor[u.category], textTransform: "capitalize" }}>{CATEGORY_LABELS[u.category]}</span>
                    {u.all_departments ? (
                      <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "0.15rem 0.5rem", borderRadius: "var(--radius-full)", background: "var(--color-primary-light)", color: "var(--color-primary-dark)" }}>All departments</span>
                    ) : (
                      departmentNames(u).map((name) => (
                        <span key={name} style={{ fontSize: "0.7rem", fontWeight: 500, padding: "0.15rem 0.5rem", borderRadius: "var(--radius-full)", background: "var(--color-primary-light)", color: "var(--color-primary-dark)" }}>{name}</span>
                      ))
                    )}
                    {/* Deleting a department detaches it from shared pieces, which can leave
                        one with none. Flag it so it is not silently missing from builders. */}
                    {isOrphaned(u) && (
                      <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "0.15rem 0.5rem", borderRadius: "var(--radius-full)", background: "var(--color-warning-bg)", color: "var(--color-warning)" }}>No department</span>
                    )}
                    {u.genders.map((gender) => (
                      <span key={gender} style={{ fontSize: "0.7rem", fontWeight: 600, padding: "0.15rem 0.5rem", borderRadius: "var(--radius-full)", background: "var(--color-bg-elevated)", color: "var(--color-text-secondary)", textTransform: "capitalize" }}>{gender}</span>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: "0.375rem" }}>
                    <button onClick={() => openEditPiece(u)} title="Edit piece" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem", padding: "0.4rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "transparent", cursor: "pointer", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                      <Edit3 size={12} /> Edit
                    </button>
                    <button onClick={() => handleArchive(u)} title={u.is_archived ? "Restore" : "Archive"} style={{ padding: "0.4rem 0.55rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)", display: "flex" }}>
                      {u.is_archived ? <ArchiveRestore size={13} /> : <MoreHorizontal size={13} />}
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

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Name <span style={{ color: "var(--color-error)" }}>*</span></label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. White Usher Shirt" style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.9rem", outline: "none", background: "var(--color-bg-elevated)" }}
                  onFocus={(e) => { e.target.style.borderColor = "var(--color-primary-dark)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--color-border)"; }} />
              </div>

              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Category <span style={{ color: "var(--color-error)" }}>*</span></label>
                <select value={formCategory} onChange={(e) => setFormCategory(e.target.value as UniformCategory)}
                  style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.875rem", outline: "none", background: "var(--color-bg-elevated)" }}>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <PieceScopeFields departments={departments} value={formScope} onChange={setFormScope} />

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
                    : <><Upload size={15} /> Upload piece</>}
                </button>
                <button onClick={resetForm} className="btn-back" style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-full)", padding: "0.75rem 1.1rem" }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreateLook && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(33,28,25,0.5)", backdropFilter: "blur(3px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div className="card" style={{ width: "100%", maxWidth: 460, padding: "1.75rem", position: "relative" }}>
            <button onClick={() => setShowCreateLook(false)} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}><X size={18} /></button>
            <div className="eyebrow eyebrow-accent" style={{ marginBottom: "0.4rem" }}>Create look</div>
            <h2 className="display-serif" style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Choose a <em className="serif-em">starting point</em></h2>
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <Link href="/branch/combinations/palette/new" className="btn-primary" style={{ justifyContent: "space-between", padding: "0.85rem 1rem", textDecoration: "none" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}><Sparkles size={16} /> Use colour palette</span>
                <ChevronRight size={16} />
              </Link>
              <Link href="/branch/combinations/new" className="btn-secondary" style={{ justifyContent: "space-between", padding: "0.85rem 1rem", textDecoration: "none" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}><Shirt size={16} /> Use uploaded pieces</span>
                <ChevronRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {editingPiece && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(33,28,25,0.5)", backdropFilter: "blur(3px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div className="card" style={{ width: "100%", maxWidth: 520, padding: "1.75rem", position: "relative" }}>
            <button onClick={() => setEditingPiece(null)} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}><X size={18} /></button>
            <div className="eyebrow eyebrow-accent" style={{ marginBottom: "0.4rem" }}>The Wardrobe</div>
            <h2 className="display-serif" style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Edit <em className="serif-em">piece</em></h2>
            <div style={{ display: "grid", gap: "0.9rem" }}>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Name</label>
                <input value={editingPiece.name} onChange={(e) => setEditingPiece({ ...editingPiece, name: e.target.value })} style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.9rem", outline: "none", background: "var(--color-bg-elevated)" }} />
              </div>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Category</label>
                <select value={editingPiece.category} onChange={(e) => setEditingPiece({ ...editingPiece, category: e.target.value as UniformCategory })} style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.875rem", outline: "none", background: "var(--color-bg-elevated)" }}>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <PieceScopeFields
                departments={departments}
                value={{
                  departmentIds: editingPiece.department_ids,
                  allDepartments: editingPiece.all_departments,
                  genders: editingPiece.genders,
                }}
                onChange={(next) => setEditingPiece({
                  ...editingPiece,
                  department_ids: next.departmentIds,
                  all_departments: next.allDepartments,
                  genders: next.genders,
                })}
              />
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Description</label>
                <input value={editingPiece.description ?? ""} onChange={(e) => setEditingPiece({ ...editingPiece, description: e.target.value })} style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.875rem", outline: "none", background: "var(--color-bg-elevated)" }} />
              </div>
              {editError && <p style={{ color: "var(--color-error)", fontSize: "0.82rem", margin: 0 }}>{editError}</p>}
              <button onClick={handleSaveEdit} disabled={savingEdit} className="btn-primary" style={{ padding: "0.75rem" }}>
                {savingEdit ? <><Loader2 size={15} className="animate-spin" /> Saving...</> : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {assigningLook && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(33,28,25,0.5)", backdropFilter: "blur(3px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div className="card" style={{ width: "100%", maxWidth: 460, padding: "1.75rem", position: "relative" }}>
            <button onClick={() => setAssigningLook(null)} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}><X size={18} /></button>
            <div className="eyebrow eyebrow-accent" style={{ marginBottom: "0.4rem" }}>{assigningLook.departments?.name ?? "Look"}</div>
            <h2 className="display-serif" style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>Assign <em className="serif-em">{assigningLook.name}</em></h2>
            <div style={{ display: "grid", gap: "0.9rem" }}>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Service</label>
                <select value={selectedScheduleId} onChange={(e) => setSelectedScheduleId(e.target.value)} style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.875rem", outline: "none", background: "var(--color-bg-elevated)" }}>
                  {scheduleOptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.service_date} - {s.title}</option>
                  ))}
                </select>
              </div>
              {!assigningLook.gender && (
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
              <button onClick={handleAssignLook} disabled={assigning || !selectedScheduleId || !(assigningLook.gender ?? assignGender)} className="btn-primary" style={{ padding: "0.75rem" }}>
                {assigning ? <><Loader2 size={15} className="animate-spin" /> Assigning...</> : <><CalendarPlus size={15} /> Assign to service</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
