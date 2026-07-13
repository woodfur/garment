"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import type { Gender } from "@/types/database";

type Department = { id: string; name: string; description: string | null };
type PaletteColor = { id: string; hex: string; label: string };
type CreatedLook = { id: string };

const DEFAULT_COLORS: PaletteColor[] = [
  { id: "color-1", hex: "#E8C2D1", label: "Pink" },
  { id: "color-2", hex: "#E6D7C3", label: "Cream" },
  { id: "color-3", hex: "#704832", label: "Brown" },
];

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function textOn(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length < 6) return "#211C19";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#211C19" : "#FBF9F4";
}

export default function PaletteComposeClient() {
  const router = useRouter();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState("");
  const [selectedGender, setSelectedGender] = useState<Gender>("female");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [colors, setColors] = useState<PaletteColor[]>(DEFAULT_COLORS);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/branch/departments")
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.departments ?? [];
        setDepartments(list);
        setSelectedDeptId(list[0]?.id ?? "");
      })
      .catch(() => setError("Failed to load departments"))
      .finally(() => setLoading(false));
  }, []);

  const selectedDept = useMemo(
    () => departments.find((dept) => dept.id === selectedDeptId) ?? null,
    [departments, selectedDeptId]
  );

  function updateColor(id: string, patch: Partial<Pick<PaletteColor, "hex" | "label">>) {
    setColors((prev) => prev.map((color) => color.id === id ? { ...color, ...patch } : color));
  }

  function addColor() {
    if (colors.length >= 5) return;
    setColors((prev) => [
      ...prev,
      { id: `color-${Date.now()}`, hex: "#FFFFFF", label: "" },
    ]);
  }

  function removeColor(id: string) {
    if (colors.length <= 2) return;
    setColors((prev) => prev.filter((color) => color.id !== id));
  }

  function moveColor(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= colors.length) return;
    setColors((prev) => {
      const next = [...prev];
      const current = next[index];
      next[index] = next[target];
      next[target] = current;
      return next;
    });
  }

  async function handleGenerate() {
    setError(null);

    if (!selectedDeptId) { setError("Select a department"); return; }
    if (!name.trim()) { setError("Look name is required"); return; }
    if (colors.length < 2) { setError("Choose at least two colors"); return; }
    if (colors.some((color) => !HEX_RE.test(color.hex))) { setError("Every color needs a valid hex value"); return; }

    setGenerating(true);
    try {
      const res = await fetch("/api/branch/palette-looks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          department_id: selectedDeptId,
          gender: selectedGender,
          palette: colors.map((color) => ({
            hex: color.hex,
            label: color.label.trim() || null,
          })),
        }),
      });
      const data = await res.json().catch(() => ({})) as Partial<CreatedLook> & { error?: string };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Failed to generate palette look");
        return;
      }
      router.push(`/branch/combinations/${data.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="builder-root">
      <Link
        href="/branch/uniforms"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--color-text-muted)", textDecoration: "none", fontSize: "0.82rem", fontWeight: 600, marginBottom: "1rem" }}
      >
        <ArrowLeft size={15} /> Back to wardrobe
      </Link>

      <div className="builder-step">
        <div className="eyebrow eyebrow-accent" style={{ marginBottom: "0.5rem" }}>Palette compose</div>
        <h2 className="builder-step-title">Choose colors for the <em className="serif-em">look</em></h2>
        <p className="builder-step-subtitle">
          Select the department and palette. The studio will generate the outfit and place the colors beside it.
        </p>

        {loading ? (
          <div style={{ display: "grid", placeItems: "center", padding: "3rem", color: "var(--color-text-faint)" }}>
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : (
          <>
            <section style={{ marginBottom: "2rem" }}>
              <div className="rule-label" style={{ marginBottom: "0.8rem" }}>
                <span>Department</span><span className="rule" />
              </div>

              {departments.length === 0 ? (
                <p className="builder-empty">No departments yet. <Link href="/branch/departments" style={{ color: "var(--color-primary-dark)", fontWeight: 600 }}>Create one first</Link></p>
              ) : (
                <div className="dept-grid">
                  {departments.map((dept) => {
                    const selected = selectedDeptId === dept.id;
                    return (
                      <button
                        key={dept.id}
                        className={`dept-card ${selected ? "selected" : ""}`}
                        onClick={() => setSelectedDeptId(dept.id)}
                      >
                        {selected && <span className="dept-card-check">✓</span>}
                        <span className="dept-card-mono">{dept.name.charAt(0).toUpperCase()}</span>
                        <span className="dept-card-name">{dept.name}</span>
                        {dept.description && <span className="dept-card-desc">{dept.description}</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            <section style={{ marginBottom: "2rem" }}>
              <div className="rule-label" style={{ marginBottom: "0.8rem" }}>
                <span>Gender</span><span className="rule" />
              </div>
              <div className="gender-toggle" role="tablist" aria-label="Choose gender">
                <button
                  role="tab"
                  aria-selected={selectedGender === "female"}
                  className={selectedGender === "female" ? "on" : ""}
                  onClick={() => setSelectedGender("female")}
                >
                  ♀ Female
                </button>
                <button
                  role="tab"
                  aria-selected={selectedGender === "male"}
                  className={selectedGender === "male" ? "on" : ""}
                  onClick={() => setSelectedGender("male")}
                >
                  ♂ Male
                </button>
              </div>
            </section>

            <section style={{ marginBottom: "2rem" }}>
              <div className="rule-label" style={{ marginBottom: "0.8rem" }}>
                <span>Colors</span><span className="rule" />
              </div>

              <div style={{ display: "grid", gap: "0.75rem" }}>
                {colors.map((color, index) => (
                  <div
                    key={color.id}
                    className="card"
                    style={{ display: "grid", gridTemplateColumns: "72px minmax(0, 1fr) auto", gap: "0.75rem", alignItems: "center", padding: "0.8rem" }}
                  >
                    <input
                      type="color"
                      value={color.hex}
                      onChange={(event) => updateColor(color.id, { hex: event.target.value.toUpperCase() })}
                      aria-label={`Color ${index + 1}`}
                      style={{ width: 60, height: 52, border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", background: "transparent", cursor: "pointer", padding: 2 }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <input
                        value={color.label}
                        onChange={(event) => updateColor(color.id, { label: event.target.value })}
                        placeholder="Color name"
                        style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem", fontSize: "0.875rem", outline: "none", background: "var(--color-bg-elevated)", marginBottom: "0.45rem" }}
                      />
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", borderRadius: "var(--radius-full)", padding: "0.2rem 0.55rem", background: color.hex, color: textOn(color.hex), fontSize: "0.72rem", fontWeight: 700 }}>
                        {color.hex}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <button className="btn-back" title="Move up" disabled={index === 0} onClick={() => moveColor(index, -1)} style={{ padding: "0.55rem", borderRadius: "var(--radius-full)", border: "1px solid var(--color-border)" }}>
                        <ArrowUp size={14} />
                      </button>
                      <button className="btn-back" title="Move down" disabled={index === colors.length - 1} onClick={() => moveColor(index, 1)} style={{ padding: "0.55rem", borderRadius: "var(--radius-full)", border: "1px solid var(--color-border)" }}>
                        <ArrowDown size={14} />
                      </button>
                      <button className="btn-back" title="Remove color" disabled={colors.length <= 2} onClick={() => removeColor(color.id)} style={{ padding: "0.55rem", borderRadius: "var(--radius-full)", border: "1px solid var(--color-border)", color: "var(--color-error)" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "0.9rem" }}>
                <button
                  className="btn-secondary"
                  disabled={colors.length >= 5}
                  onClick={addColor}
                  style={{ padding: "0.55rem 1rem", fontSize: "0.82rem" }}
                >
                  <Plus size={14} /> Add color
                </button>
              </div>
            </section>

            <section>
              <div className="rule-label" style={{ marginBottom: "0.8rem" }}>
                <span>Look name</span><span className="rule" />
              </div>
              <div className="builder-form">
                <input
                  className="form-input"
                  placeholder={selectedDept ? `${selectedDept.name} palette` : "Service palette"}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
                <textarea
                  className="form-input"
                  placeholder="Optional notes"
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            </section>

            {error && <div className="builder-error" style={{ marginTop: "1rem" }}>{error}</div>}

            <div className="builder-nav builder-nav-save">
              <Link href="/branch/uniforms" className="btn-back" style={{ textDecoration: "none" }}>Cancel</Link>
              <button
                className="btn-primary"
                disabled={generating || departments.length === 0}
                onClick={handleGenerate}
              >
                {generating ? <><Loader2 size={15} className="animate-spin" /> Generating...</> : <><Sparkles size={15} /> Generate palette look</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
