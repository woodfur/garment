"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Shirt, Archive, ArchiveRestore, Trash2, Upload, X, Loader2, AlertTriangle } from "lucide-react";
import Image from "next/image";
import type { UniformCategory } from "@/types/database";

type Department = { id: string; name: string };
type Uniform = {
  id: string; name: string; category: string; department_id: string;
  image_url: string | null; raw_image_url: string | null; is_archived: boolean;
  bg_removed: boolean; storage_path: string | null; description: string | null; created_at: string;
  departments: { name: string } | null;
  _bgRemoving?: boolean; // client-only ephemeral flag
};

const CATEGORIES: { value: UniformCategory; label: string }[] = [
  { value: "top",       label: "Top" },
  { value: "bottom",    label: "Bottom" },
  { value: "footwear",  label: "Footwear" },
  { value: "accessory", label: "Accessory" },
  { value: "outer",     label: "Outer" },
  { value: "head",      label: "Head" },
];

export default function UniformsPageClient() {
  const [uniforms, setUniforms] = useState<Uniform[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [filterDept, setFilterDept] = useState<string>("all");

  // Upload form
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState<UniformCategory>("top");
  const [formDept, setFormDept] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formPreview, setFormPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const [uniformsRes, deptsRes] = await Promise.all([
      fetch(`/api/branch/uniforms?include_archived=${showArchived}`),
      fetch("/api/branch/departments"),
    ]);
    const [uniformsData, deptsData] = await Promise.all([uniformsRes.json(), deptsRes.json()]);
    setUniforms(Array.isArray(uniformsData) ? uniformsData : []);
    setDepartments(Array.isArray(deptsData) ? deptsData : []);
    setLoading(false);
  }, [showArchived]);

  useEffect(() => { fetchData(); }, [fetchData]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormFile(file);
    setFormPreview(URL.createObjectURL(file));
    setFormError(null);
  }

  async function handleUpload() {
    if (!formName.trim()) { setFormError("Name is required"); return; }
    if (!formDept) { setFormError("Select a department"); return; }
    if (!formFile) { setFormError("Upload a uniform image"); return; }

    setUploading(true);
    setFormError(null);

    try {
      // 1. Get a signed upload URL
      const ext = formFile.name.split(".").pop() ?? "jpg";
      const storagePath = `${formDept}/${Date.now()}.${ext}`;
      const uploadRes = await fetch(`/api/branch/uniforms/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: storagePath, contentType: formFile.type }),
      });

      if (!uploadRes.ok) {
        setFormError("Image upload service unavailable. Please try again.");
        setUploading(false);
        return;
      }
      const { uploadUrl, publicUrl: rawUrl } = await uploadRes.json();

      // 2. Upload the raw file
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        body: formFile,
        headers: { "Content-Type": formFile.type },
      });
      if (!putRes.ok) {
        setFormError("Image upload failed. Please try again.");
        setUploading(false);
        return;
      }

      // 3. Create the DB record immediately (with raw image)
      const createRes = await fetch("/api/branch/uniforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName.trim(),
          category: formCategory,
          department_id: formDept,
          description: formDesc.trim() || null,
          storage_path: storagePath,
          raw_image_url: rawUrl,
          image_url: rawUrl, // will be replaced after bg removal
          bg_removed: false,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) { setFormError(created.error ?? "Failed to save"); setUploading(false); return; }

      // Optimistic add to list immediately
      const dept = departments.find(d => d.id === formDept);
      const newUniform: Uniform = {
        ...created,
        storage_path: storagePath,
        departments: dept ? { name: dept.name } : null,
        _bgRemoving: true,
      };
      setUniforms((prev) => [newUniform, ...prev]);
      resetForm();
      setUploading(false);

      // 4. Trigger server-side background removal (non-blocking)
      triggerBgRemoval(created.id, storagePath);
    } catch (err) {
      console.error(err);
      setFormError("Upload failed. Please try again.");
      setUploading(false);
    }
  }

  async function triggerBgRemoval(uniformId: string, storagePath: string) {
    // Mark as removing in UI
    setUniforms((prev) => prev.map((u) => u.id === uniformId ? { ...u, _bgRemoving: true } : u));

    try {
      const res = await fetch("/api/branch/uniforms/remove-bg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uniformId, storagePath }),
      });
      const data = await res.json();
      if (res.ok && data.image_url) {
        setUniforms((prev) => prev.map((u) =>
          u.id === uniformId
            ? { ...u, image_url: data.image_url, bg_removed: true, _bgRemoving: false }
            : u
        ));
      } else {
        // BG removal failed — just clear the spinner, keep raw image
        setUniforms((prev) => prev.map((u) => u.id === uniformId ? { ...u, _bgRemoving: false } : u));
      }
    } catch {
      setUniforms((prev) => prev.map((u) => u.id === uniformId ? { ...u, _bgRemoving: false } : u));
    }
  }

  function resetForm() {
    setShowForm(false); setFormName(""); setFormCategory("top");
    setFormDept(""); setFormDesc(""); setFormFile(null);
    setFormPreview(null); setFormError(null); setUploading(false);
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

  async function handleDelete(id: string) {
    setDeletingId(id);
    const res = await fetch(`/api/branch/uniforms/${id}`, { method: "DELETE" });
    if (res.ok) setUniforms((prev) => prev.filter((u) => u.id !== id));
    setDeletingId(null);
  }

  const filtered = uniforms.filter((u) => filterDept === "all" || u.department_id === filterDept);

  if (loading) return null;

  const categoryColor: Record<string, string> = {
    top: "var(--color-primary-dark)", bottom: "var(--color-info)",
    footwear: "var(--color-success)", accessory: "var(--color-gold)",
    outer: "#8B5CF6", head: "var(--color-warning)",
  };

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.75rem", marginBottom: "0.25rem" }}>Uniforms</h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>{filtered.length} item{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <div style={{ display: "flex", gap: "0.625rem", alignItems: "center" }}>
          <button
            onClick={() => setShowArchived((v) => !v)}
            style={{
              display: "flex", alignItems: "center", gap: "0.4rem",
              padding: "0.6rem 1rem", borderRadius: "var(--radius-md)",
              background: showArchived ? "var(--color-primary-light)" : "transparent",
              border: "1px solid var(--color-border)", fontSize: "0.82rem",
              color: showArchived ? "var(--color-primary-dark)" : "var(--color-text-muted)", cursor: "pointer",
            }}
          >
            <Archive size={14} /> {showArchived ? "Hide Archived" : "Show Archived"}
          </button>
          {departments.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.6rem 1rem", borderRadius: "var(--radius-md)", background: "var(--color-warning-bg)", border: "1px solid var(--color-warning)", fontSize: "0.82rem", color: "var(--color-warning)" }}>
              <AlertTriangle size={13} />
              <a href="/branch/departments" style={{ color: "inherit", fontWeight: 600 }}>Create a department first</a>
            </div>
          ) : (
            <button
              id="add-uniform-btn"
              onClick={() => { setShowForm(true); setFormDept(departments[0]?.id ?? ""); }}
              style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                padding: "0.65rem 1.25rem", borderRadius: "var(--radius-md)",
                background: "linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%)",
                color: "#fff", border: "none", fontWeight: 600, fontSize: "0.875rem", cursor: "pointer",
              }}
            >
              <Plus size={15} /> Add Uniform
            </button>
          )}
        </div>
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

      {/* Upload form modal */}
      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div className="card" style={{ width: "100%", maxWidth: 520, padding: "2rem", position: "relative", maxHeight: "90dvh", overflowY: "auto" }}>
            <button onClick={resetForm} style={{ position: "absolute", top: "1rem", right: "1rem", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)" }}><X size={18} /></button>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.25rem" }}>Add Uniform</h2>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Image upload */}
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.4rem" }}>
                  Image <span style={{ color: "var(--color-error)" }}>*</span>
                </label>
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: `2px dashed ${formPreview ? "var(--color-primary-dark)" : "var(--color-border)"}`,
                    borderRadius: "var(--radius-md)", padding: "1.25rem",
                    textAlign: "center", cursor: "pointer",
                    background: formPreview ? "var(--color-primary-light)" : "var(--color-bg-primary)",
                    transition: "all 0.15s",
                  }}
                >
                  {formPreview ? (
                    <div style={{ position: "relative", width: 100, height: 100, margin: "0 auto" }}>
                      <Image src={formPreview} alt="Preview" fill style={{ objectFit: "contain" }} unoptimized />
                    </div>
                  ) : (
                    <div>
                      <Upload size={24} color="var(--color-text-disabled)" style={{ margin: "0 auto 0.5rem" }} />
                      <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted)", margin: 0 }}>Click to upload image</p>
                      <p style={{ fontSize: "0.75rem", color: "var(--color-text-disabled)", margin: "0.25rem 0 0" }}>PNG, JPG, WEBP</p>
                    </div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
              </div>

              {/* Name */}
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Name <span style={{ color: "var(--color-error)" }}>*</span></label>
                <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. White Usher Shirt" style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.9rem", outline: "none" }}
                  onFocus={(e) => { e.target.style.borderColor = "var(--color-primary-dark)"; e.target.style.boxShadow = "0 0 0 3px rgba(155,135,245,0.15)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--color-border)"; e.target.style.boxShadow = "none"; }} />
              </div>

              {/* Category + Department */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Category <span style={{ color: "var(--color-error)" }}>*</span></label>
                  <select value={formCategory} onChange={(e) => setFormCategory(e.target.value as UniformCategory)}
                    style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.875rem", outline: "none", background: "#fff" }}>
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Department <span style={{ color: "var(--color-error)" }}>*</span></label>
                  <select value={formDept} onChange={(e) => setFormDept(e.target.value)}
                    style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.875rem", outline: "none", background: "#fff" }}>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>Description <span style={{ color: "var(--color-text-disabled)" }}>(optional)</span></label>
                <input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Brief notes about this item" style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.875rem", outline: "none" }}
                  onFocus={(e) => { e.target.style.borderColor = "var(--color-primary-dark)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--color-border)"; }} />
              </div>

              {formError && <p style={{ color: "var(--color-error)", fontSize: "0.82rem", margin: 0 }}>{formError}</p>}

              <div style={{ display: "flex", gap: "0.625rem" }}>
                <button onClick={handleUpload} disabled={uploading} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem",
                  padding: "0.7rem", borderRadius: "var(--radius-md)",
                  background: "linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%)",
                  color: "#fff", border: "none", fontWeight: 600, fontSize: "0.9rem",
                  cursor: uploading ? "not-allowed" : "pointer",
                  opacity: uploading ? 0.7 : 1,
                }}>
                  {uploading ? <><Loader2 size={15} className="animate-spin" /> Uploading…</> : <><Upload size={15} /> Upload Uniform</>}
                </button>
                <button onClick={resetForm} style={{ padding: "0.7rem 1rem", borderRadius: "var(--radius-md)", background: "transparent", border: "1px solid var(--color-border)", cursor: "pointer", color: "var(--color-text-muted)", fontSize: "0.875rem" }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <div style={{ width: 64, height: 64, borderRadius: "var(--radius-lg)", background: "var(--color-primary-light)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem" }}>
            <Shirt size={28} color="var(--color-primary-dark)" />
          </div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.25rem", marginBottom: "0.5rem" }}>No uniforms yet</h2>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", maxWidth: 320, margin: "0 auto" }}>Upload your first uniform item to get started.</p>
        </div>
      )}

      {/* Uniform grid */}
      {filtered.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
          {filtered.map((u) => (
            <div key={u.id} className="card" style={{ padding: 0, overflow: "hidden", opacity: u.is_archived ? 0.65 : 1, transition: "opacity 0.15s" }}>
              {/* Image */}
              <div style={{ height: 180, background: u.bg_removed ? "repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%) 0 0 / 20px 20px" : "var(--color-bg-primary)", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                {u.image_url ? (
                  <Image src={u.image_url} alt={u.name} fill style={{ objectFit: "contain", padding: "0.5rem" }} unoptimized />
                ) : (
                  <Shirt size={48} color="var(--color-text-disabled)" />
                )}
                {/* BG removing spinner */}
                {u._bgRemoving && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 0 }}>
                    <Loader2 size={22} className="animate-spin" color="#fff" />
                    <span style={{ fontSize: "0.7rem", color: "#fff", fontWeight: 600 }}>Removing bg…</span>
                  </div>
                )}
                {/* Status badges */}
                {!u._bgRemoving && u.bg_removed && (
                  <div style={{ position: "absolute", top: "0.5rem", left: "0.5rem", background: "rgba(34,197,94,0.85)", color: "#fff", fontSize: "0.6rem", fontWeight: 700, padding: "0.2rem 0.45rem", borderRadius: "var(--radius-full)", textTransform: "uppercase", backdropFilter: "blur(4px)" }}>✓ BG removed</div>
                )}
                {u.is_archived && (
                  <div style={{ position: "absolute", top: "0.5rem", right: "0.5rem", background: "var(--color-warning)", color: "#fff", fontSize: "0.65rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "var(--radius-full)", textTransform: "uppercase" }}>Archived</div>
                )}
              </div>
              {/* Info */}
              <div style={{ padding: "0.875rem" }}>
                <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.3rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</div>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                  <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "0.15rem 0.5rem", borderRadius: "var(--radius-full)", background: `${categoryColor[u.category] ?? "#999"}20`, color: categoryColor[u.category] ?? "#999", textTransform: "capitalize" }}>{u.category}</span>
                  {u.departments?.name && (
                    <span style={{ fontSize: "0.7rem", fontWeight: 500, padding: "0.15rem 0.5rem", borderRadius: "var(--radius-full)", background: "var(--color-primary-light)", color: "var(--color-primary-dark)" }}>{u.departments.name}</span>
                  )}
                </div>
                {/* Actions */}
                <div style={{ display: "flex", gap: "0.375rem" }}>
                  <button onClick={() => handleArchive(u)} title={u.is_archived ? "Unarchive" : "Archive"} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem", padding: "0.4rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "transparent", cursor: "pointer", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
                    {u.is_archived ? <><ArchiveRestore size={12} /> Restore</> : <><Archive size={12} /> Archive</>}
                  </button>
                  <button onClick={() => handleDelete(u.id)} disabled={deletingId === u.id} title="Delete" style={{ padding: "0.4rem 0.6rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)", display: "flex" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-error)"; e.currentTarget.style.borderColor = "var(--color-error)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-muted)"; e.currentTarget.style.borderColor = "var(--color-border)"; }}>
                    {deletingId === u.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
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
