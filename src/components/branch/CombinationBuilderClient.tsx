"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight, ChevronLeft, Layers, Check, Loader2,
  Trash2, ArrowUp, ArrowDown, Shirt,
} from "lucide-react";
import Image from "next/image";

type Department = { id: string; name: string };
type Uniform = {
  id: string; name: string; category: string;
  image_url: string | null; bg_removed: boolean;
  departments: { name: string } | null;
};

type CanvasItem = {
  uniformId: string;
  uniformName: string;
  imageUrl: string;
  layerOrder: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

const CANVAS_W = 420;
const CANVAS_H = 560;

export default function CombinationBuilderClient() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1 — Department
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [loadingDepts, setLoadingDepts] = useState(true);

  // Step 2 — Canvas
  const [uniforms, setUniforms] = useState<Uniform[]>([]);
  const [loadingUniforms, setLoadingUniforms] = useState(false);
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ idx: number; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Step 3 — Name & Save
  const [comboName, setComboName] = useState("");
  const [comboDesc, setComboDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load departments
  useEffect(() => {
    fetch("/api/branch/departments")
      .then((r) => r.json())
      .then((d) => { setDepartments(Array.isArray(d) ? d : []); setLoadingDepts(false); });
  }, []);

  // Load uniforms when department chosen
  const loadUniforms = useCallback(async (deptId: string) => {
    setLoadingUniforms(true);
    const res = await fetch(`/api/branch/uniforms?department_id=${deptId}&include_archived=false`);
    const data = await res.json();
    setUniforms(Array.isArray(data) ? data : []);
    setLoadingUniforms(false);
  }, []);

  function goStep2() {
    if (!selectedDept) return;
    setStep(2);
    loadUniforms(selectedDept.id);
  }

  function addToCanvas(u: Uniform) {
    if (!u.image_url) return;
    setCanvasItems((prev) => [
      ...prev,
      {
        uniformId: u.id,
        uniformName: u.name,
        imageUrl: u.image_url!,
        layerOrder: prev.length,
        x: 80 + prev.length * 15,
        y: 80 + prev.length * 15,
        scaleX: 1,
        scaleY: 1,
      },
    ]);
    setSelectedIdx(canvasItems.length);
  }

  function removeItem(idx: number) {
    setCanvasItems((prev) => prev.filter((_, i) => i !== idx).map((item, i) => ({ ...item, layerOrder: i })));
    setSelectedIdx(null);
  }

  function moveLayer(idx: number, dir: -1 | 1) {
    const newItems = [...canvasItems];
    const target = idx + dir;
    if (target < 0 || target >= newItems.length) return;
    [newItems[idx], newItems[target]] = [newItems[target], newItems[idx]];
    newItems.forEach((item, i) => { item.layerOrder = i; });
    setCanvasItems(newItems);
    setSelectedIdx(target);
  }

  // Mouse drag logic
  function onMouseDown(e: React.MouseEvent, idx: number) {
    e.preventDefault();
    setSelectedIdx(idx);
    const rect = canvasRef.current!.getBoundingClientRect();
    dragging.current = {
      idx,
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      origX: canvasItems[idx].x,
      origY: canvasItems[idx].y,
    };
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const dx = (e.clientX - rect.left) - dragging.current.startX;
      const dy = (e.clientY - rect.top) - dragging.current.startY;
      setCanvasItems((prev) => prev.map((item, i) =>
        i === dragging.current!.idx
          ? { ...item, x: dragging.current!.origX + dx, y: dragging.current!.origY + dy }
          : item
      ));
    }
    function onMouseUp() { dragging.current = null; }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => { window.removeEventListener("mousemove", onMouseMove); window.removeEventListener("mouseup", onMouseUp); };
  }, []);

  async function handleSave() {
    if (!comboName.trim()) { setSaveError("Name is required"); return; }
    if (!selectedDept) return;
    setSaving(true);
    setSaveError(null);

    try {
      // Generate canvas preview as a data URL from the div
      let previewUrl: string | null = null;
      try {
        // Use html2canvas-like approach: capture canvas via toBlob on an offscreen canvas
        const canvas = document.createElement("canvas");
        canvas.width = CANVAS_W * 2;
        canvas.height = CANVAS_H * 2;
        const ctx = canvas.getContext("2d")!;
        ctx.scale(2, 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

        for (const item of [...canvasItems].sort((a, b) => a.layerOrder - b.layerOrder)) {
          await new Promise<void>((resolve) => {
            const img = new window.Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
              const W = 140 * item.scaleX;
              const H = 140 * item.scaleY;
              ctx.drawImage(img, item.x, item.y, W, H);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = item.imageUrl;
          });
        }

        const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
        if (blob) {
          // Upload preview
          const uploadRes = await fetch("/api/branch/combinations/upload-preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: `${Date.now()}.png` }),
          });
          if (uploadRes.ok) {
            const { uploadUrl, publicUrl } = await uploadRes.json();
            await fetch(uploadUrl, { method: "PUT", body: blob, headers: { "Content-Type": "image/png" } });
            previewUrl = publicUrl;
          }
        }
      } catch (previewErr) {
        console.warn("Preview generation failed:", previewErr);
      }

      // Save combination
      const items = canvasItems.map((item) => ({
        uniform_id: item.uniformId,
        layer_order: item.layerOrder,
        x: item.x,
        y: item.y,
        scale_x: item.scaleX,
        scale_y: item.scaleY,
        rotation: 0,
      }));

      const res = await fetch("/api/branch/combinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: comboName.trim(),
          description: comboDesc.trim() || null,
          department_id: selectedDept.id,
          canvas_data: { items },
          preview_url: previewUrl,
          items,
        }),
      });

      const data = await res.json();
      if (!res.ok) { setSaveError(data.error ?? "Failed to save"); return; }
      router.push("/branch/combinations");
    } catch (err) {
      console.error(err);
      setSaveError("Failed to save combination");
    } finally {
      setSaving(false);
    }
  }

  // ─── Step indicator ───────────────────────────────────────────────
  const steps = ["Department", "Build Outfit", "Save"];

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Back link */}
      <button onClick={() => step === 1 ? router.push("/branch/combinations") : setStep(step - 1)}
        style={{ display: "flex", alignItems: "center", gap: "0.375rem", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: "0.875rem", marginBottom: "1.5rem", padding: 0 }}>
        <ChevronLeft size={16} /> {step === 1 ? "Back to Combinations" : steps[step - 2]}
      </button>

      <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.75rem", marginBottom: "0.5rem" }}>Build Combination</h1>

      {/* Step indicators */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "2rem" }}>
        {steps.map((label, i) => {
          const n = i + 1;
          const active = step === n;
          const done = step > n;
          return (
            <div key={n} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                background: done ? "var(--color-success)" : active ? "var(--color-primary-dark)" : "var(--color-border)",
                color: done || active ? "#fff" : "var(--color-text-muted)",
                fontSize: "0.75rem", fontWeight: 700, flexShrink: 0,
              }}>
                {done ? <Check size={13} /> : n}
              </div>
              <span style={{ fontSize: "0.82rem", fontWeight: active ? 600 : 400, color: active ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>{label}</span>
              {i < steps.length - 1 && <ChevronRight size={14} color="var(--color-border)" />}
            </div>
          );
        })}
      </div>

      {/* ── STEP 1 ── Department ── */}
      {step === 1 && (
        <div className="card" style={{ padding: "2rem", maxWidth: 480 }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.5rem" }}>Select Department</h2>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", marginBottom: "1.5rem" }}>
            The outfit will only include uniforms from this department.
          </p>
          {loadingDepts ? (
            <div className="skeleton" style={{ height: 48, borderRadius: "var(--radius-md)" }} />
          ) : departments.length === 0 ? (
            <div style={{ padding: "1rem", borderRadius: "var(--radius-md)", background: "var(--color-warning-bg)", border: "1px solid var(--color-warning)", fontSize: "0.875rem", color: "var(--color-warning)" }}>
              No departments found. <a href="/branch/departments" style={{ color: "inherit", fontWeight: 600 }}>Create one first →</a>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem", marginBottom: "1.5rem" }}>
              {departments.map((d) => (
                <button key={d.id} onClick={() => setSelectedDept(d)} style={{
                  padding: "0.875rem 1rem", borderRadius: "var(--radius-md)",
                  border: `2px solid ${selectedDept?.id === d.id ? "var(--color-primary-dark)" : "var(--color-border)"}`,
                  background: selectedDept?.id === d.id ? "var(--color-primary-light)" : "transparent",
                  cursor: "pointer", textAlign: "left", fontWeight: selectedDept?.id === d.id ? 600 : 400,
                  color: selectedDept?.id === d.id ? "var(--color-primary-dark)" : "var(--color-text-primary)",
                  fontSize: "0.9rem", transition: "all 0.15s",
                }}>
                  {d.name}
                </button>
              ))}
            </div>
          )}
          <button onClick={goStep2} disabled={!selectedDept} style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            padding: "0.7rem 1.5rem", borderRadius: "var(--radius-md)",
            background: "linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%)",
            color: "#fff", border: "none", fontWeight: 600, fontSize: "0.9rem",
            cursor: !selectedDept ? "not-allowed" : "pointer", opacity: !selectedDept ? 0.5 : 1,
          }}>
            Next: Build Outfit <ChevronRight size={15} />
          </button>
        </div>
      )}

      {/* ── STEP 2 ── Canvas ── */}
      {step === 2 && (
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "1.5rem", alignItems: "start" }}>
          {/* Uniform picker sidebar */}
          <div className="card" style={{ padding: "1rem" }}>
            <p style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-muted)", marginBottom: "0.75rem" }}>
              {selectedDept?.name} Uniforms
            </p>
            {loadingUniforms ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 64, borderRadius: "var(--radius-md)" }} />)}
              </div>
            ) : uniforms.length === 0 ? (
              <div style={{ textAlign: "center", padding: "1.5rem 0.5rem" }}>
                <Shirt size={28} color="var(--color-text-disabled)" style={{ margin: "0 auto 0.5rem" }} />
                <p style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                  No uniforms in {selectedDept?.name}. <a href="/branch/uniforms" style={{ color: "var(--color-primary-dark)" }}>Add some →</a>
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {uniforms.map((u) => (
                  <button key={u.id} onClick={() => addToCanvas(u)} disabled={!u.image_url}
                    title={!u.image_url ? "No image available" : `Add ${u.name}`}
                    style={{
                      display: "flex", alignItems: "center", gap: "0.625rem",
                      padding: "0.5rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)",
                      background: "transparent", cursor: u.image_url ? "pointer" : "not-allowed",
                      opacity: u.image_url ? 1 : 0.4, textAlign: "left",
                    }}
                    onMouseEnter={(e) => { if (u.image_url) e.currentTarget.style.borderColor = "var(--color-primary-dark)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
                  >
                    <div style={{ width: 44, height: 44, borderRadius: "var(--radius-sm)", background: "var(--color-bg-primary)", flexShrink: 0, overflow: "hidden", position: "relative" }}>
                      {u.image_url && <Image src={u.image_url} alt={u.name} fill style={{ objectFit: "contain" }} unoptimized />}
                    </div>
                    <span style={{ fontSize: "0.78rem", fontWeight: 500, lineHeight: 1.3 }}>{u.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Canvas area */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted)" }}>
                {canvasItems.length === 0 ? "Add uniforms from the panel →" : `${canvasItems.length} item${canvasItems.length !== 1 ? "s" : ""} on canvas`}
              </p>
              {selectedIdx !== null && (
                <div style={{ display: "flex", gap: "0.375rem" }}>
                  <button onClick={() => moveLayer(selectedIdx, -1)} title="Move up" style={{ padding: "0.3rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "transparent", cursor: "pointer" }}><ArrowUp size={13} /></button>
                  <button onClick={() => moveLayer(selectedIdx, 1)} title="Move down" style={{ padding: "0.3rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "transparent", cursor: "pointer" }}><ArrowDown size={13} /></button>
                  <button onClick={() => removeItem(selectedIdx)} title="Remove" style={{ padding: "0.3rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)", background: "transparent", cursor: "pointer", color: "var(--color-error)" }}><Trash2 size={13} /></button>
                </div>
              )}
            </div>

            {/* Canvas */}
            <div ref={canvasRef} style={{
              width: CANVAS_W, height: CANVAS_H, border: "2px dashed var(--color-border)",
              borderRadius: "var(--radius-lg)", background: "#fff", position: "relative",
              overflow: "hidden", cursor: "default", userSelect: "none",
            }}>
              {canvasItems.length === 0 && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <Layers size={40} color="var(--color-text-disabled)" style={{ marginBottom: "0.75rem" }} />
                  <p style={{ fontSize: "0.85rem", color: "var(--color-text-disabled)" }}>Drop uniforms here</p>
                </div>
              )}
              {[...canvasItems].sort((a, b) => a.layerOrder - b.layerOrder).map((item, i) => {
                const origIdx = canvasItems.findIndex((c) => c.uniformId === item.uniformId && c.layerOrder === item.layerOrder);
                return (
                  <div key={`${item.uniformId}-${item.layerOrder}`}
                    onMouseDown={(e) => onMouseDown(e, origIdx)}
                    style={{
                      position: "absolute", left: item.x, top: item.y,
                      width: 140 * item.scaleX, height: 140 * item.scaleY,
                      cursor: "grab", outline: selectedIdx === origIdx ? "2px solid var(--color-primary-dark)" : "none",
                      outlineOffset: 2, borderRadius: 4,
                    }}
                  >
                    <Image src={item.imageUrl} alt={item.uniformName} fill style={{ objectFit: "contain" }} unoptimized />
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1.25rem" }}>
              <button onClick={() => setStep(3)} disabled={canvasItems.length === 0}
                style={{
                  display: "flex", alignItems: "center", gap: "0.5rem",
                  padding: "0.7rem 1.5rem", borderRadius: "var(--radius-md)",
                  background: "linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%)",
                  color: "#fff", border: "none", fontWeight: 600, fontSize: "0.9rem",
                  cursor: canvasItems.length === 0 ? "not-allowed" : "pointer",
                  opacity: canvasItems.length === 0 ? 0.5 : 1,
                }}>
                Next: Name & Save <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 3 ── Name & Save ── */}
      {step === 3 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem", alignItems: "start" }}>
          {/* Canvas preview */}
          <div>
            <p style={{ fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-muted)", marginBottom: "0.5rem" }}>Preview</p>
            <div ref={previewRef} style={{
              width: "100%", aspectRatio: `${CANVAS_W}/${CANVAS_H}`, background: "#fff",
              border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)",
              position: "relative", overflow: "hidden",
            }}>
              {[...canvasItems].sort((a, b) => a.layerOrder - b.layerOrder).map((item) => (
                <div key={`${item.uniformId}-${item.layerOrder}-preview`} style={{
                  position: "absolute",
                  left: `${(item.x / CANVAS_W) * 100}%`,
                  top: `${(item.y / CANVAS_H) * 100}%`,
                  width: `${(140 * item.scaleX / CANVAS_W) * 100}%`,
                  height: `${(140 * item.scaleY / CANVAS_H) * 100}%`,
                }}>
                  <Image src={item.imageUrl} alt={item.uniformName} fill style={{ objectFit: "contain" }} unoptimized />
                </div>
              ))}
            </div>
            <p style={{ fontSize: "0.75rem", color: "var(--color-text-disabled)", marginTop: "0.5rem", textAlign: "center" }}>
              {canvasItems.length} uniform{canvasItems.length !== 1 ? "s" : ""} · {selectedDept?.name}
            </p>
          </div>

          {/* Save form */}
          <div className="card" style={{ padding: "1.75rem" }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.25rem" }}>Name Your Combination</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>
                  Name <span style={{ color: "var(--color-error)" }}>*</span>
                </label>
                <input value={comboName} onChange={(e) => { setComboName(e.target.value); setSaveError(null); }}
                  placeholder="e.g. Sunday Ushers Formal"
                  autoFocus
                  style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.9rem", outline: "none" }}
                  onFocus={(e) => { e.target.style.borderColor = "var(--color-primary-dark)"; e.target.style.boxShadow = "0 0 0 3px rgba(155,135,245,0.15)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--color-border)"; e.target.style.boxShadow = "none"; }}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>
                  Description <span style={{ color: "var(--color-text-disabled)" }}>(optional)</span>
                </label>
                <textarea value={comboDesc} onChange={(e) => setComboDesc(e.target.value)} rows={3}
                  placeholder="Notes about this combination…"
                  style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.875rem", outline: "none", resize: "vertical" }}
                  onFocus={(e) => { e.target.style.borderColor = "var(--color-primary-dark)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--color-border)"; }}
                />
              </div>

              <div style={{ padding: "0.65rem 0.875rem", borderRadius: "var(--radius-md)", background: "var(--color-primary-light)", fontSize: "0.82rem", color: "var(--color-primary-dark)" }}>
                Department: <strong>{selectedDept?.name}</strong>
              </div>

              {saveError && <p style={{ color: "var(--color-error)", fontSize: "0.82rem", margin: 0 }}>{saveError}</p>}

              <button onClick={handleSave} disabled={saving || !comboName.trim()} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                padding: "0.75rem", borderRadius: "var(--radius-md)",
                background: "linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%)",
                color: "#fff", border: "none", fontWeight: 600, fontSize: "0.9rem",
                cursor: saving || !comboName.trim() ? "not-allowed" : "pointer",
                opacity: saving || !comboName.trim() ? 0.6 : 1,
              }}>
                {saving ? <><Loader2 size={15} className="animate-spin" /> Saving…</> : <><Check size={15} /> Save Combination</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
