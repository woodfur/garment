"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { DepartmentChips } from "./PieceScopeFields";
import {
  MAX_LOOK_NOTES,
  UPLOADED_FOOTWEAR_REQUIRED_MESSAGE,
  hasUploadedFootwearPhoto,
} from "@/lib/look-prompt";
import { ZONE_CATEGORIES, STANDARD_ZONES, ACCESSORY_ZONES, zoneLabel } from "@/types/zones";
import type { BodyZone, Gender } from "@/types/database";
import type { Uniform, Department, InventoryItem, CombinationZoneItemWithSource } from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ZoneMap = Partial<Record<BodyZone, CombinationZoneItemWithSource>>;
type OutfitState = { male: ZoneMap; female: ZoneMap };
type InventoryAccessory = InventoryItem & {
  category_name?: string;
  assigned_quantity?: number;
  available_quantity?: number;
};
type PickerPiece =
  | { source: "uniform"; data: Uniform }
  | { source: "inventory"; data: InventoryAccessory };

type Step = 1 | 2 | 3;

/** Readable text colour (ink or paper) for a label sitting on a colour swatch. */
function textOn(hex: string): string {
  const c = hex.replace("#", "");
  if (c.length < 6) return "#211C19";
  const r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#211C19" : "#FBF9F4";
}

function isAccessoryZone(zone: BodyZone | null): boolean {
  return !!zone && zone.startsWith("accessory_");
}

function pieceName(item: CombinationZoneItemWithSource): string {
  return item.uniform?.name ?? item.inventory_item?.name ?? "[Deleted]";
}

function pieceImage(item: CombinationZoneItemWithSource): string | null {
  return item.uniform?.image_url ?? item.inventory_item?.image_url ?? null;
}

function pieceBgRemoved(item: CombinationZoneItemWithSource): boolean {
  return item.uniform?.bg_removed ?? item.inventory_item?.bg_removed ?? true;
}

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
  const [inventoryAccessories, setInventoryAccessories] = useState<InventoryAccessory[]>([]);
  const [outfit, setOutfit] = useState<OutfitState>({ male: {}, female: {} });
  const [activeGender, setActiveGender] = useState<Gender>("male");
  const [genderLocked, setGenderLocked] = useState(false);
  const [activeZone, setActiveZone] = useState<BodyZone | null>("top");
  const [showAccessories, setShowAccessories] = useState(false);

  // Step 3: Save
  const [combinationId, setCombinationId] = useState<string | null>(null);
  // GAP-2 FIX: Persist comboId in a ref so retries after partial failure reuse the same record.
  // React state setters don't update synchronously — on retry after zone-insert failure,
  // combinationId state may already hold the new ID but a naive re-check would miss it.
  // The ref ensures the created ID persists across render cycles without race conditions.
  const savedComboIdRef = useRef<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  // Which departments may use the finished look. Defaults to the one it was built for;
  // adding more here reuses this render rather than paying for another.
  const [shareScope, setShareScope] = useState<{ departmentIds: string[]; allDepartments: boolean }>({
    departmentIds: [],
    allDepartments: false,
  });
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

  // Seed sharing with the department the look is being built for. Additional departments
  // are opted into on the save step; this only sets the starting point.
  useEffect(() => {
    if (!selectedDept) return;
    setShareScope((prev) =>
      prev.departmentIds.length === 0 && !prev.allDepartments
        ? { departmentIds: [selectedDept.id], allDepartments: false }
        : prev
    );
  }, [selectedDept]);

  // Load uniforms when department and gender are selected
  useEffect(() => {
    if (!selectedDept || !genderLocked) return;
    fetch(`/api/branch/uniforms?department_id=${selectedDept.id}&gender=${activeGender}&include_archived=false`)
      .then((r) => r.json())
      .then((d) => setUniforms(Array.isArray(d) ? d : d.uniforms ?? []))
      .catch(console.error);
  }, [selectedDept, activeGender, genderLocked]);

  // Inventory accessories are branch-wide and gender-neutral; they are shown only in accessory zones.
  useEffect(() => {
    if (!genderLocked) return;
    fetch("/api/branch/inventory/items?include_archived=false")
      .then((r) => r.json())
      .then((d) => setInventoryAccessories(Array.isArray(d) ? d : []))
      .catch(console.error);
  }, [genderLocked]);

  // Picker pieces filtered to the active zone. Inventory accessories are not stock-filtered here;
  // assignment availability is enforced when pieces are issued for a service.
  const filteredUniforms = activeZone
    ? uniforms.filter((u) => u.category === ZONE_CATEGORIES[activeZone])
    : uniforms;
  const pickerPieces: PickerPiece[] = [
    ...filteredUniforms.map((u) => ({ source: "uniform" as const, data: u })),
    ...(isAccessoryZone(activeZone)
      ? inventoryAccessories.map((item) => ({ source: "inventory" as const, data: item }))
      : []),
  ];

  // Has bg_removed issues
  const bgWarnings = (() => {
    const all = Object.values(outfit[activeGender]) as CombinationZoneItemWithSource[];
    return all.filter((item) => pieceImage(item) && !pieceBgRemoved(item)).map(pieceName);
  })();

  // ---------------------------------------------------------------------------
  // Zone assignment handlers
  // ---------------------------------------------------------------------------
  const assignUniform = useCallback((uniform: Uniform) => {
    if (!activeZone) return;
    const fakeItem: CombinationZoneItemWithSource = {
      id: `temp-${Date.now()}`,
      combination_id: "",
      gender: activeGender,
      zone: activeZone,
      uniform_id: uniform.id,
      inventory_item_id: null,
      created_at: new Date().toISOString(),
      uniform,
      inventory_item: null,
    };
    setOutfit((prev) => ({
      ...prev,
      [activeGender]: { ...prev[activeGender], [activeZone]: fakeItem },
    }));
  }, [activeGender, activeZone]);

  const assignInventoryAccessory = useCallback((item: InventoryAccessory) => {
    if (!activeZone || !isAccessoryZone(activeZone)) return;
    const fakeItem: CombinationZoneItemWithSource = {
      id: `temp-${Date.now()}`,
      combination_id: "",
      gender: activeGender,
      zone: activeZone,
      uniform_id: null,
      inventory_item_id: item.id,
      created_at: new Date().toISOString(),
      uniform: null,
      inventory_item: item,
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

  // ---------------------------------------------------------------------------
  // Step 3: Save combination + zone items
  // ---------------------------------------------------------------------------
  const saveCombination = async (generatePreview: boolean) => {
    if (!name.trim() || !selectedDept) return;
    if (!hasRequiredFootwear) {
      setError(UPLOADED_FOOTWEAR_REQUIRED_MESSAGE);
      return;
    }
    setSaving(true);
    setError(null);

    try {
      // 1. Create combination — use savedComboIdRef for idempotency across retries
      let comboId = savedComboIdRef.current ?? combinationId;
      if (!comboId) {
        const trimmedNotes = notes.trim();
        const res = await fetch("/api/branch/combinations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            canvas_data: { mode: "pieces", notes: trimmedNotes || null },
            department_ids: shareScope.departmentIds,
            all_departments: shareScope.allDepartments,
            gender: activeGender,
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create combination");
        const combo = await res.json();
        comboId = combo.id;
        savedComboIdRef.current = comboId; // persist immediately — survives render cycles
        setCombinationId(comboId);
      }

      // 2. Save zone items — clear then re-insert to avoid phantom items from removed zones
      // GAP-4 FIX: Use savedComboIdRef.current to detect re-saves.
      // Previously used comboId===combinationId, but combinationId state doesn't update
      // synchronously — on first save, the state is still null even though comboId is set.
      if (savedComboIdRef.current !== null && comboId) {
        // This is a re-save — clear existing items before upserting
        const clearRes = await fetch(`/api/branch/combinations/${comboId}/zones`, { method: "DELETE" });
        if (!clearRes.ok) {
          const clearData = await clearRes.json().catch(() => ({}));
          throw new Error(clearData.error ?? "Failed to clear existing zone assignments");
        }
      }

      const allItems = [
        ...Object.entries(outfit[activeGender]).map(([zone, item]) => ({
          gender: activeGender,
          zone: zone as BodyZone,
          uniform_id: item!.uniform_id,
          inventory_item_id: item!.inventory_item_id,
        })),
      ];

      // GAP-5 FIX: Sequential inserts instead of Promise.all.
      // Parallel inserts leave partial state in DB if one zone fails mid-flight
      // (other requests complete while the failed one throws, and the catch block
      // can't roll them back). Sequential ensures we either stop early or finish all.
      for (const item of allItems) {
        const r = await fetch(`/api/branch/combinations/${comboId}/zones`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          throw new Error(data.error ?? `Failed to save zone: ${item.zone}`);
        }
      }

      if (generatePreview) {
        setGenerating(true);
        const previewRes = await fetch(`/api/branch/combinations/${comboId}/generate-preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gender: activeGender }),
        });
        // GAP-3 FIX: Check response status — a 400/500 (e.g. 'no zone items') was previously
        // silently ignored, causing a redirect with no error feedback and preview stuck at 'none'.
        if (!previewRes.ok) {
          const previewData = await previewRes.json().catch(() => ({}));
          throw new Error(previewData.error ?? "Failed to start AI preview generation. Please try again.");
        }
        const previewData = await previewRes.json();
        if (previewData.estimated_seconds) setEstimatedSeconds(previewData.estimated_seconds);
        if (previewData.warnings?.length) setWarnings(previewData.warnings);
        setGenerating(false);
      }

      router.push("/branch/uniforms");
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
  const zonesToRender = showAccessories
    ? [...STANDARD_ZONES, ...ACCESSORY_ZONES]
    : STANDARD_ZONES;

  const activeOutfitEntries = Object.entries(outfit[activeGender]) as [BodyZone, CombinationZoneItemWithSource][];
  const totalAssigned = activeOutfitEntries.length;
  const hasRequiredFootwear = hasUploadedFootwearPhoto(
    activeOutfitEntries.map(([zone, item]) => ({ zone, imageUrl: pieceImage(item) }))
  );
  const canProceed = totalAssigned > 0 && hasRequiredFootwear;

  return (
    <div className="builder-root">
      {/* ------------------------------------------------------------------ */}
      {/* Progress bar */}
      {/* ------------------------------------------------------------------ */}
      <div className="builder-progress">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className={`builder-step-dot ${step >= s ? "active" : ""}`}>
            <span>{s}</span>
            <label>{s === 1 ? "Department" : s === 2 ? "Gender & Pieces" : "Save"}</label>
          </div>
        ))}
        <div className="builder-progress-line" style={{ width: `${((step - 1) / 2) * 100}%` }} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Step 1 — Department */}
      {/* ------------------------------------------------------------------ */}
      {step === 1 && (
        <div className="builder-step">
          <div className="eyebrow eyebrow-accent" style={{ marginBottom: "0.5rem" }}>Step one</div>
          <h2 className="builder-step-title">Choose a <em className="serif-em">department</em></h2>
          <p className="builder-step-subtitle">This look will be styled from that department&rsquo;s wardrobe.</p>
          <div className="dept-grid">
            {departments.map((dept) => {
              const selected = selectedDept?.id === dept.id;
              return (
                <button
                  key={dept.id}
                  className={`dept-card ${selected ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedDept(dept);
                    setGenderLocked(false);
                    setUniforms([]);
                    setOutfit({ male: {}, female: {} });
                  }}
                >
                  {selected && <span className="dept-card-check">✓</span>}
                  <span className="dept-card-mono">{dept.name.charAt(0).toUpperCase()}</span>
                  <span className="dept-card-name">{dept.name}</span>
                  {dept.description && <span className="dept-card-desc">{dept.description}</span>}
                </button>
              );
            })}
            {departments.length === 0 && (
              <p className="builder-empty">No departments yet. <a href="/branch/departments" style={{ color: "var(--color-primary-dark)", fontWeight: 600 }}>Create one first →</a></p>
            )}
          </div>
          <div className="builder-nav">
            <button
              className="btn-primary"
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
          <div className="eyebrow eyebrow-accent" style={{ marginBottom: "0.5rem" }}>Step two</div>
          <h2 className="builder-step-title">Choose gender, then style the <em className="serif-em">look</em></h2>
          <p className="builder-step-subtitle">
            Only pieces for the selected department and gender will appear.
          </p>

          {/* Gender selection — locks the look to one gender.
              Selected styling is gated on genderLocked, not just activeGender: the latter
              defaults to "male", so keying off it alone painted Male as chosen before any
              gender had been picked, while pieces stayed unloaded because the fetch waits
              on genderLocked. The button has to tell the truth about that state. */}
          <div className="gender-toggle" role="tablist" aria-label="Choose figure">
            {(["male", "female"] as Gender[]).map((gender) => {
              const chosen = genderLocked && activeGender === gender;
              return (
                <button
                  key={gender}
                  role="tab"
                  aria-selected={chosen}
                  className={chosen ? "on" : ""}
                  onClick={() => { setActiveGender(gender); setGenderLocked(true); setUniforms([]); }}
                >
                  {gender === "male" ? "♂ Male" : "♀ Female"}
                </button>
              );
            })}
          </div>
          <p className="gender-caption">
            {genderLocked
              ? <>Styling the <b>{activeGender}</b> look · {Object.keys(outfit[activeGender]).length}{" "}
                {Object.keys(outfit[activeGender]).length === 1 ? "piece" : "pieces"} placed</>
              : "Select a gender to load matching pieces."}
          </p>

          {/* Zone chips — replaces the mannequin hotspots */}
          <div className="zone-tabs" role="tablist" aria-label="Body zones">
            {zonesToRender.map((zone) => {
              const item = outfit[activeGender][zone];
              return (
                <button
                  key={zone}
                  role="tab"
                  aria-selected={activeZone === zone}
                  className={`zone-tab ${activeZone === zone ? "on" : ""} ${item ? "filled" : ""}`}
                  onClick={() => setActiveZone(zone)}
                >
                  <span className="zone-tab-label">{zoneLabel(zone, activeGender)}</span>
                  {item && <span className="zone-tab-dot" aria-hidden>●</span>}
                </button>
              );
            })}
            <button
              className="zone-tab zone-tab-acc"
              onClick={() => setShowAccessories((v) => !v)}
            >
              {showAccessories ? "− Accessories" : "+ Accessories"}
            </button>
          </div>

          {/* Stage — the selected zone's piece, shown large */}
          <div className="fit-stage">
            {(() => {
              const assigned = activeZone ? outfit[activeGender][activeZone] : null;
              if (!activeZone) {
                return <div className="fit-stage-empty"><span>Select a zone above</span></div>;
              }
              if (assigned && (assigned.uniform || assigned.inventory_item)) {
                const imageUrl = pieceImage(assigned);
                const name = pieceName(assigned);
                return (
                  <div className="fit-stage-filled">
                    <div className="fit-stage-frame">
                      {imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imageUrl} alt={name} className="fit-stage-img" />
                      ) : assigned.uniform?.color ? (
                        <div style={{ width: "100%", height: "100%", background: assigned.uniform.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: textOn(assigned.uniform.color), background: "rgba(0,0,0,0.12)", padding: "0.25rem 0.6rem", borderRadius: 999 }}>
                            {assigned.uniform.color_label || assigned.uniform.color}
                          </span>
                        </div>
                      ) : (
                        <span className="fit-stage-initial">{name[0]}</span>
                      )}
                    </div>
                    <div className="fit-stage-meta">
                      <span className="eyebrow eyebrow-accent">{zoneLabel(activeZone, activeGender)}</span>
                      <span className="fit-stage-name">{name}</span>
                      {imageUrl && !pieceBgRemoved(assigned) && (
                        <span className="fit-stage-warn">⚠️ Background not removed</span>
                      )}
                      <button
                        className="fit-stage-clear"
                        onClick={() => clearZone(activeGender, activeZone)}
                      >
                        Remove piece
                      </button>
                    </div>
                  </div>
                );
              }
              return (
                <div className="fit-stage-empty">
                  <span className="fit-stage-empty-zone">{zoneLabel(activeZone, activeGender)}</span>
                  <span>Pick a piece below to dress this zone</span>
                </div>
              );
            })()}
          </div>

          {/* Picker — pieces for the active zone, always visible (no scrolling) */}
          <div className="fit-picker">
            {!genderLocked ? (
              <div className="fit-picker-empty">
                <p>Select a gender above to show matching pieces.</p>
              </div>
            ) : pickerPieces.length === 0 ? (
              <div className="fit-picker-empty">
                <p style={{ marginBottom: "0.75rem" }}>
                  {activeZone
                    ? `No ${activeGender} ${zoneLabel(activeZone, activeGender).toLowerCase()} pieces in ${selectedDept?.name}.`
                    : `No ${activeGender} pieces in ${selectedDept?.name ?? "this department"} yet.`}
                </p>
                <a
                  href="/branch/uniforms"
                  className="btn-primary"
                  style={{ padding: "0.5rem 1rem", fontSize: "0.8rem", textDecoration: "none" }}
                >
                  ＋ Add to wardrobe
                </a>
              </div>
            ) : (
              <div className="fit-picker-grid">
                {pickerPieces.map((piece) => {
                  const selected = !!activeZone && (
                    piece.source === "uniform"
                      ? outfit[activeGender][activeZone]?.uniform_id === piece.data.id
                      : outfit[activeGender][activeZone]?.inventory_item_id === piece.data.id
                  );
                  const imageUrl = piece.data.image_url;
                  return (
                    <button
                      key={`${piece.source}-${piece.data.id}`}
                      className={`fit-piece ${selected ? "on" : ""}`}
                      onClick={() => piece.source === "uniform" ? assignUniform(piece.data) : assignInventoryAccessory(piece.data)}
                    >
                      <div className="fit-piece-frame">
                        {imageUrl ? (
                          <Image src={imageUrl} alt={piece.data.name} fill sizes="(max-width: 560px) 45vw, 140px" className="fit-piece-img" />
                        ) : piece.source === "uniform" && piece.data.color ? (
                          <div style={{ position: "absolute", inset: 0, background: piece.data.color }} />
                        ) : (
                          <span className="fit-piece-initial">{piece.data.name[0]}</span>
                        )}
                        {selected && <span className="fit-piece-check">✓</span>}
                        {imageUrl && !piece.data.bg_removed && <span className="fit-piece-warn" title="Background not removed">⚠️</span>}
                      </div>
                      <span className="fit-piece-name">{piece.data.name}</span>
                      {piece.source === "inventory" && (
                        <span className="fit-piece-source">{piece.data.category_name ?? "Inventory"}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {genderLocked && totalAssigned > 0 && !hasRequiredFootwear && (
            <div className="builder-warning">
              {UPLOADED_FOOTWEAR_REQUIRED_MESSAGE}
            </div>
          )}

          <div className="builder-nav">
            <button className="btn-back" onClick={() => setStep(1)}>← Back</button>
            <button
              className="btn-primary"
              disabled={!genderLocked || !canProceed}
              onClick={() => setStep(3)}
            >
              {genderLocked && totalAssigned > 0 && !hasRequiredFootwear
                ? "Select footwear to continue"
                : `Continue → (${totalAssigned} placed)`}
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 3 — Name & Save */}
      {/* ------------------------------------------------------------------ */}
      {step === 3 && (
        <div className="builder-step">
          <div className="eyebrow eyebrow-accent" style={{ marginBottom: "0.5rem" }}>Step three</div>
          <h2 className="builder-step-title">Name &amp; <em className="serif-em">save</em> the look</h2>
          <p className="builder-step-subtitle">Review the pieces, give the look a name, then render it.</p>

          {/* Zone summary */}
          <div className="summary-grid">
            <div className="summary-card">
              <h4 className="summary-gender">{activeGender === "male" ? "♂ Male look" : "♀ Female look"}</h4>
              <ul className="summary-list">
                {(Object.entries(outfit[activeGender]) as [BodyZone, CombinationZoneItemWithSource][]).map(([zone, item]) => (
                  <li key={zone} className="summary-item">
                    <span className="summary-zone">{zoneLabel(zone, activeGender)}</span>
                    <span className="summary-uniform">{pieceName(item)}</span>
                    {pieceImage(item) && !pieceBgRemoved(item) && <span className="summary-warn">⚠️</span>}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {bgWarnings.length > 0 && (
            <div className="builder-warning">
              <strong>⚠️ Background not removed:</strong> {bgWarnings.join(", ")}. Preview quality may be affected.
            </div>
          )}

          {error && <div className="builder-error">{error}</div>}

          {!hasRequiredFootwear && (
            <div className="builder-warning">
              {UPLOADED_FOOTWEAR_REQUIRED_MESSAGE}
            </div>
          )}

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
              Look name <span className="required">*</span>
            </label>
            <input
              className="form-input"
              placeholder="e.g. Sunday Ushers — Formal"
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

            <label className="form-label">Extra direction</label>
            <textarea
              className="form-input"
              placeholder="e.g. relaxed Wednesday styling, untucked linen shirt, clean loafers"
              rows={2}
              maxLength={MAX_LOOK_NOTES}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <div style={{ marginTop: "1rem" }}>
              <DepartmentChips
                departments={departments}
                departmentIds={shareScope.departmentIds}
                allDepartments={shareScope.allDepartments}
                onChange={setShareScope}
                label="Departments that can use this look"
                hint="Share a look instead of rebuilding it — every department here reuses this one render."
              />
            </div>
          </div>

          <div className="builder-nav builder-nav-save">
            <button className="btn-back" onClick={() => setStep(2)}>← Back</button>
            <button
              className="btn-ghost"
              disabled={!name.trim() || saving || !hasRequiredFootwear}
              onClick={() => saveCombination(false)}
            >
              {saving ? "Saving…" : "Save without preview"}
            </button>
            <button
              className="btn-primary"
              disabled={!name.trim() || saving || generating || !hasRequiredFootwear}
              onClick={() => saveCombination(true)}
            >
              {saving || generating ? "Saving & generating…" : "💫 Save & generate AI preview"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
