"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ZONE_POSITIONS, ZONE_CATEGORIES, ZONE_LAYER_ORDER, STANDARD_ZONES, ACCESSORY_ZONES } from "@/types/zones";
import { MANNEQUIN_MALE_URL, MANNEQUIN_FEMALE_URL } from "@/lib/mannequin-config";
import type { BodyZone, Gender } from "@/types/database";
import type { Uniform, Department, CombinationZoneItemWithUniform } from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ZoneMap = Partial<Record<BodyZone, CombinationZoneItemWithUniform>>;
type OutfitState = { male: ZoneMap; female: ZoneMap };

type Step = 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function CombinationBuilderClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);

  // Step 1: Department
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);

  // Step 2: Zone assignment
  const [uniforms, setUniforms] = useState<Uniform[]>([]);
  const [outfit, setOutfit] = useState<OutfitState>({ male: {}, female: {} });
  const [activeGender, setActiveGender] = useState<Gender>("male");
  const [activeZone, setActiveZone] = useState<BodyZone | null>(null);
  const [showAccessories, setShowAccessories] = useState(false);
  const [draggedUniform, setDraggedUniform] = useState<Uniform | null>(null);

  // Step 3: Save
  const [combinationId, setCombinationId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [estimatedSeconds, setEstimatedSeconds] = useState<number | null>(null);

  // Load departments
  useEffect(() => {
    fetch("/api/branch/departments")
      .then((r) => r.json())
      .then((d) => setDepartments(Array.isArray(d) ? d : d.departments ?? []))
      .catch(console.error);
  }, []);

  // Load uniforms when department selected
  useEffect(() => {
    if (!selectedDept) return;
    fetch(`/api/branch/uniforms?department_id=${selectedDept.id}&archived=false`)
      .then((r) => r.json())
      .then((d) => setUniforms(Array.isArray(d) ? d : d.uniforms ?? []))
      .catch(console.error);
  }, [selectedDept]);

  // Uniforms filtered to active zone category
  const filteredUniforms = activeZone
    ? uniforms.filter((u) => u.category === ZONE_CATEGORIES[activeZone])
    : uniforms;

  // Has bg_removed issues
  const bgWarnings = (() => {
    const all = [...Object.values(outfit.male), ...Object.values(outfit.female)] as CombinationZoneItemWithUniform[];
    return all.filter((item) => item?.uniform && !item.uniform.bg_removed).map((item) => item.uniform.name);
  })();

  // ---------------------------------------------------------------------------
  // Zone assignment handlers
  // ---------------------------------------------------------------------------
  const handleZoneClick = (gender: Gender, zone: BodyZone) => {
    setActiveGender(gender);
    setActiveZone(zone);
  };

  const assignUniform = useCallback((uniform: Uniform) => {
    if (!activeZone) return;
    const fakeItem: CombinationZoneItemWithUniform = {
      id: `temp-${Date.now()}`,
      combination_id: "",
      gender: activeGender,
      zone: activeZone,
      uniform_id: uniform.id,
      created_at: new Date().toISOString(),
      uniform,
    };
    setOutfit((prev) => ({
      ...prev,
      [activeGender]: { ...prev[activeGender], [activeZone]: fakeItem },
    }));
  }, [activeGender, activeZone]);

  const clearZone = (gender: Gender, zone: BodyZone) => {
    setOutfit((prev) => {
      const updated = { ...prev[gender] };
      delete updated[zone];
      return { ...prev, [gender]: updated };
    });
    if (activeGender === gender && activeZone === zone) setActiveZone(null);
  };

  // Drag & Drop
  const handleDragStart = (uniform: Uniform) => setDraggedUniform(uniform);
  const handleDragEnd = () => setDraggedUniform(null);

  const handleDrop = (gender: Gender, zone: BodyZone) => {
    if (!draggedUniform) return;
    const fakeItem: CombinationZoneItemWithUniform = {
      id: `temp-${Date.now()}`,
      combination_id: "",
      gender,
      zone,
      uniform_id: draggedUniform.id,
      created_at: new Date().toISOString(),
      uniform: draggedUniform,
    };
    setOutfit((prev) => ({
      ...prev,
      [gender]: { ...prev[gender], [zone]: fakeItem },
    }));
    setDraggedUniform(null);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  // ---------------------------------------------------------------------------
  // Step 3: Save combination + zone items
  // ---------------------------------------------------------------------------
  const saveCombination = async (generatePreview: boolean) => {
    if (!name.trim() || !selectedDept) return;
    setSaving(true);
    setError(null);

    try {
      // 1. Create combination
      let comboId = combinationId;
      if (!comboId) {
        const res = await fetch("/api/branch/combinations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), description: description.trim() || null, department_id: selectedDept.id }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create combination");
        const combo = await res.json();
        comboId = combo.id;
        setCombinationId(comboId);
      }

      // 2. Save zone items for both genders
      const allItems = [
        ...Object.entries(outfit.male).map(([zone, item]) => ({ gender: "male" as Gender, zone: zone as BodyZone, uniform_id: item!.uniform_id })),
        ...Object.entries(outfit.female).map(([zone, item]) => ({ gender: "female" as Gender, zone: zone as BodyZone, uniform_id: item!.uniform_id })),
      ];

      await Promise.all(allItems.map((item) =>
        fetch(`/api/branch/combinations/${comboId}/zones`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        })
      ));

      if (generatePreview) {
        setGenerating(true);
        const previewRes = await fetch(`/api/branch/combinations/${comboId}/generate-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gender: "both" }),
        });
        const previewData = await previewRes.json();
        if (previewData.estimated_seconds) setEstimatedSeconds(previewData.estimated_seconds);
        if (previewData.warnings?.length) setWarnings(previewData.warnings);
        setGenerating(false);
      }

      router.push("/branch/combinations");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
      setGenerating(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const mannequinUrl = { male: MANNEQUIN_MALE_URL, female: MANNEQUIN_FEMALE_URL };
  const zonesToRender = showAccessories
    ? [...STANDARD_ZONES, ...ACCESSORY_ZONES]
    : STANDARD_ZONES;

  const totalAssigned = Object.keys(outfit.male).length + Object.keys(outfit.female).length;
  const canProceed = totalAssigned > 0;

  return (
    <div className="builder-root">
      {/* ------------------------------------------------------------------ */}
      {/* Progress bar */}
      {/* ------------------------------------------------------------------ */}
      <div className="builder-progress">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className={`builder-step-dot ${step >= s ? "active" : ""}`}>
            <span>{s}</span>
            <label>{s === 1 ? "Department" : s === 2 ? "Assign Zones" : "Save"}</label>
          </div>
        ))}
        <div className="builder-progress-line" style={{ width: `${((step - 1) / 2) * 100}%` }} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Step 1 — Department */}
      {/* ------------------------------------------------------------------ */}
      {step === 1 && (
        <div className="builder-step">
          <h2 className="builder-step-title">Choose a Department</h2>
          <p className="builder-step-subtitle">The combination will only use uniforms from this department.</p>
          <div className="dept-grid">
            {departments.map((dept) => (
              <button
                key={dept.id}
                className={`dept-card ${selectedDept?.id === dept.id ? "selected" : ""}`}
                onClick={() => setSelectedDept(dept)}
              >
                <span className="dept-card-icon">🏢</span>
                <span className="dept-card-name">{dept.name}</span>
                {dept.description && <span className="dept-card-desc">{dept.description}</span>}
              </button>
            ))}
            {departments.length === 0 && (
              <p className="builder-empty">No departments found. Create a department first.</p>
            )}
          </div>
          <div className="builder-nav">
            <button
              className="btn btn-primary"
              disabled={!selectedDept}
              onClick={() => setStep(2)}
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 2 — Zone Assignment */}
      {/* ------------------------------------------------------------------ */}
      {step === 2 && (
        <div className="builder-step">
          <h2 className="builder-step-title">Assign Uniforms to Zones</h2>
          <p className="builder-step-subtitle">
            Click a zone on either mannequin, then select a uniform from the panel. You can also drag uniforms directly onto zones.
          </p>

          <div className="zone-builder-layout">
            {/* Mannequins */}
            {(["male", "female"] as Gender[]).map((gender) => (
              <div key={gender} className="mannequin-column">
                <h3 className="mannequin-label">{gender === "male" ? "👔 Male" : "👗 Female"}</h3>
                <div
                  className="mannequin-canvas"
                  style={{ position: "relative" }}
                >
                  {mannequinUrl[gender] ? (
                    <img
                      src={mannequinUrl[gender]}
                      alt={`${gender} character`}
                      className="mannequin-img"
                      draggable={false}
                    />
                  ) : (
                    <div className="mannequin-placeholder">
                      <span>{gender === "male" ? "♂" : "♀"}</span>
                      <span className="mannequin-placeholder-text">Character loading…</span>
                    </div>
                  )}

                  {/* Zone hotspots */}
                  {zonesToRender.map((zone) => {
                    const pos = ZONE_POSITIONS[zone];
                    const assigned = outfit[gender][zone];
                    const isActive = activeGender === gender && activeZone === zone;
                    return (
                      <div
                        key={zone}
                        className={`zone-hotspot ${assigned ? "filled" : "empty"} ${isActive ? "zone-active" : ""}`}
                        style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -50%)" }}
                        onClick={() => handleZoneClick(gender, zone)}
                        onDragOver={handleDragOver}
                        onDrop={() => {
                          if (draggedUniform && ZONE_CATEGORIES[zone] === draggedUniform.category) {
                            handleDrop(gender, zone);
                          }
                        }}
                        title={pos.label}
                      >
                        {assigned ? (
                          <div className="zone-filled-content">
                            {assigned.uniform.image_url ? (
                              <Image
                                src={assigned.uniform.image_url}
                                alt={assigned.uniform.name}
                                width={40}
                                height={40}
                                className="zone-uniform-thumb"
                              />
                            ) : (
                              <span className="zone-uniform-initial">{assigned.uniform.name[0]}</span>
                            )}
                            <button
                              className="zone-clear-btn"
                              onClick={(e) => { e.stopPropagation(); clearZone(gender, zone); }}
                            >×</button>
                          </div>
                        ) : (
                          <div className="zone-empty-content">
                            <span className="zone-plus">+</span>
                            <span className="zone-label">{pos.label}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Accessory toggle */}
                <button
                  className="accessories-toggle"
                  onClick={() => setShowAccessories((v) => !v)}
                >
                  {showAccessories ? "Hide Accessories" : "⊕ Show Accessories"}
                </button>
              </div>
            ))}

            {/* Uniform Panel */}
            <div className="uniform-panel">
              <div className="uniform-panel-header">
                <h3>Uniforms</h3>
                {activeZone && (
                  <div className="active-zone-badge">
                    {activeGender === "male" ? "👔" : "👗"} {ZONE_POSITIONS[activeZone].label}
                  </div>
                )}
                {!activeZone && <p className="panel-hint">Click a zone to filter</p>}
              </div>

              <div className="uniform-panel-list">
                {filteredUniforms.length === 0 && (
                  <p className="panel-empty">
                    {activeZone
                      ? `No ${ZONE_CATEGORIES[activeZone]} uniforms in ${selectedDept?.name}.`
                      : "No uniforms found."}
                  </p>
                )}
                {filteredUniforms.map((u) => (
                  <div
                    key={u.id}
                    className={`panel-uniform-card ${activeZone && ZONE_CATEGORIES[activeZone] !== u.category ? "dimmed" : ""}`}
                    draggable
                    onDragStart={() => handleDragStart(u)}
                    onDragEnd={handleDragEnd}
                    onClick={() => activeZone && ZONE_CATEGORIES[activeZone] === u.category && assignUniform(u)}
                  >
                    {u.image_url ? (
                      <Image src={u.image_url} alt={u.name} width={48} height={48} className="panel-uniform-img" />
                    ) : (
                      <div className="panel-uniform-placeholder">{u.name[0]}</div>
                    )}
                    <div className="panel-uniform-info">
                      <span className="panel-uniform-name">{u.name}</span>
                      <span className={`panel-uniform-cat cat-${u.category}`}>{u.category}</span>
                    </div>
                    {!u.bg_removed && <span className="panel-uniform-warn" title="Background not removed">⚠️</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="builder-nav">
            <button className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
            <button
              className="btn btn-primary"
              disabled={!canProceed}
              onClick={() => setStep(3)}
            >
              Continue → ({totalAssigned} assigned)
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 3 — Name & Save */}
      {/* ------------------------------------------------------------------ */}
      {step === 3 && (
        <div className="builder-step">
          <h2 className="builder-step-title">Name & Save</h2>

          {/* Zone summary */}
          <div className="summary-grid">
            {(["male", "female"] as Gender[]).map((gender) => (
              <div key={gender} className="summary-card">
                <h4 className="summary-gender">{gender === "male" ? "👔 Male Outfit" : "👗 Female Outfit"}</h4>
                {Object.keys(outfit[gender]).length === 0 ? (
                  <p className="summary-empty">No zones assigned</p>
                ) : (
                  <ul className="summary-list">
                    {(Object.entries(outfit[gender]) as [BodyZone, CombinationZoneItemWithUniform][]).map(([zone, item]) => (
                      <li key={zone} className="summary-item">
                        <span className="summary-zone">{ZONE_POSITIONS[zone].label}</span>
                        <span className="summary-uniform">{item.uniform.name}</span>
                        {!item.uniform.bg_removed && <span className="summary-warn">⚠️</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          {bgWarnings.length > 0 && (
            <div className="builder-warning">
              <strong>⚠️ Background not removed:</strong> {bgWarnings.join(", ")}. Preview quality may be affected.
            </div>
          )}

          {error && <div className="builder-error">{error}</div>}

          {warnings.length > 0 && (
            <div className="builder-warning">
              {warnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
          )}

          {estimatedSeconds && (
            <div className="builder-info">
              🎬 AI preview will be ready in approximately {Math.ceil(estimatedSeconds / 60)} minutes.
            </div>
          )}

          <div className="builder-form">
            <label className="form-label">
              Combination Name <span className="required">*</span>
            </label>
            <input
              className="form-input"
              placeholder="e.g. Sunday Ushers Formal"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <label className="form-label">Description</label>
            <textarea
              className="form-input"
              placeholder="Optional description…"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="builder-nav builder-nav-save">
            <button className="btn btn-ghost" onClick={() => setStep(2)}>← Back</button>
            <button
              className="btn btn-ghost"
              disabled={!name.trim() || saving}
              onClick={() => saveCombination(false)}
            >
              {saving ? "Saving…" : "Save without Preview"}
            </button>
            <button
              className="btn btn-primary"
              disabled={!name.trim() || saving || generating}
              onClick={() => saveCombination(true)}
            >
              {saving || generating ? "Saving & Generating…" : "💫 Save & Generate AI Preview"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
