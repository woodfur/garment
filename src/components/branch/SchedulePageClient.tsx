"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import PublicScheduleShareButton from "@/components/branch/PublicScheduleShareButton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Department {
  id: string;
  name: string;
}

interface Combination {
  id: string;
  name: string;
  gender: "male" | "female" | null;
  preview_status: "none" | "processing" | "ready" | "failed";
  male_composite_url: string | null;
  female_composite_url: string | null;
  male_gif_url: string | null;
  female_gif_url: string | null;
}

interface Assignment {
  id: string;
  department_id: string;
  gender: "male" | "female" | null;
  combination_id: string;
  department: Department | null;
  combination: Combination | null;
}

interface Schedule {
  id: string;
  service_date: string;
  title: string;
  notes: string | null;
  assignments: Assignment[];
}

/** An assignment tagged with the schedule row it actually belongs to. */
type SourcedAssignment = Assignment & { _scheduleId: string };

/** One calendar day's card — may merge several duplicate schedule rows. */
interface GroupedSchedule {
  id: string; // primary schedule row — new outfits are assigned here
  ids: string[]; // every schedule row for this date (deleted together)
  service_date: string;
  title: string;
  notes: string | null;
  assignments: SourcedAssignment[];
}

// ─── Assign Form (inline) ─────────────────────────────────────────────────────

function AssignForm({
  scheduleId,
  existingAssignments,
  onAssigned,
  onCancel,
}: {
  scheduleId: string;
  existingAssignments: Assignment[];
  onAssigned: (assignment: Assignment) => void;
  onCancel: () => void;
}) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [combinations, setCombinations] = useState<Combination[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState("");
  const [selectedGender, setSelectedGender] = useState<"male" | "female" | "">("");
  const [selectedComboId, setSelectedComboId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [loadingCombos, setLoadingCombos] = useState(false);

  // Load departments on mount
  useEffect(() => {
    setLoadingDepts(true);
    fetch("/api/branch/departments")
      .then((r) => r.json())
      .then((data) => {
        setDepartments(Array.isArray(data) ? data : []);
      })
      .catch(() => setError("Failed to load departments"))
      .finally(() => setLoadingDepts(false));
  }, []);

  // Load combinations when department changes
  useEffect(() => {
    if (!selectedDeptId || !selectedGender) {
      setCombinations([]);
      setSelectedComboId("");
      return;
    }
    setLoadingCombos(true);
    setSelectedComboId("");
    fetch(`/api/branch/combinations?department_id=${selectedDeptId}`)
      .then((r) => r.json())
      .then((data: Combination[]) => {
        // The server already scoped by department (shared looks included); only the
        // gender needs narrowing here.
        const filtered = Array.isArray(data)
          ? data.filter((c) => c.gender === selectedGender || c.gender === null)
          : [];
        setCombinations(filtered);
      })
      .catch(() => setError("Failed to load combinations"))
      .finally(() => setLoadingCombos(false));
  }, [selectedDeptId, selectedGender]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDeptId || !selectedGender || !selectedComboId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/branch/schedules/${scheduleId}/assignments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            department_id: selectedDeptId,
            combination_id: selectedComboId,
            gender: selectedGender,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to assign outfit");
        return;
      }
      onAssigned(data as Assignment);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="spc-assign-form">
      <h4 className="spc-assign-form-title">Assign Department Outfit</h4>

      {error && <p className="spc-error-inline">{error}</p>}

      <div className="spc-form-row">
        <label className="spc-label" htmlFor="dept-select">
          Department
        </label>
        {loadingDepts ? (
          <div className="skeleton spc-select-skeleton" />
        ) : (
          <select
            id="dept-select"
            className="spc-select"
            value={selectedDeptId}
            onChange={(e) => {
              setSelectedDeptId(e.target.value);
              setSelectedGender("");
              setSelectedComboId("");
            }}
            required
          >
            <option value="">Select department…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="spc-form-row">
        <label className="spc-label" htmlFor="gender-select">
          Gender
        </label>
        <select
          id="gender-select"
          className="spc-select"
          value={selectedGender}
          onChange={(e) => {
            setSelectedGender(e.target.value as "male" | "female" | "");
            setSelectedComboId("");
          }}
          required
          disabled={!selectedDeptId}
        >
          <option value="">
            {selectedDeptId ? "Select gender…" : "Select a department first"}
          </option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </div>

      <div className="spc-form-row">
        <label className="spc-label" htmlFor="combo-select">
          Outfit Combination
        </label>
        {loadingCombos ? (
          <div className="skeleton spc-select-skeleton" />
        ) : (
          <select
            id="combo-select"
            className="spc-select"
            value={selectedComboId}
            onChange={(e) => setSelectedComboId(e.target.value)}
            required
            disabled={!selectedDeptId || !selectedGender}
          >
            <option value="">
              {!selectedDeptId
                ? "Select a department first"
                : !selectedGender
                  ? "Select gender first"
                  : combinations.length === 0
                    ? "No combinations for this department and gender"
                    : "Select combination…"}
            </option>
            {combinations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.gender ? `${c.name} (${c.gender})` : `${c.name} (legacy, assign as ${selectedGender})`}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="spc-assign-actions">
        <button
          type="button"
          onClick={onCancel}
          className="spc-btn spc-btn-ghost"
          disabled={loading}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="spc-btn spc-btn-primary"
          disabled={loading || !selectedDeptId || !selectedGender || !selectedComboId}
        >
          {loading ? "Assigning…" : "Assign Outfit"}
        </button>
      </div>
    </form>
  );
}

// ─── Preview Status Badge ─────────────────────────────────────────────────────

function PreviewBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    ready: { label: "✓ Ready", cls: "badge-success" },
    processing: { label: "⏳ Processing", cls: "badge-warning" },
    failed: { label: "✗ Failed", cls: "badge-error" },
    none: { label: "Not started", cls: "badge-neutral" },
  };
  const { label, cls } = cfg[status] ?? cfg.none;
  return <span className={`spc-badge ${cls}`}>{label}</span>;
}

function getAssignmentPreview(assignment: Assignment): { url: string; gender: "male" | "female"; isVideo: boolean } | null {
  const combo = assignment.combination;
  if (!combo || !assignment.gender) return null;
  if (assignment.gender === "male") {
    if (combo.male_composite_url) return { url: combo.male_composite_url, gender: "male", isVideo: false };
    if (combo.male_gif_url) return { url: combo.male_gif_url, gender: "male", isVideo: true };
    return null;
  }
  if (combo.female_composite_url) return { url: combo.female_composite_url, gender: "female", isVideo: false };
  if (combo.female_gif_url) return { url: combo.female_gif_url, gender: "female", isVideo: true };
  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

/** Local "YYYY-MM-DD" for a Date (matches how service_date is stored/compared). */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nextRegularServices(): { date: string; title: string }[] {
  const out: { date: string; title: string }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today.getFullYear(), 8, 30);
  if (today > end) return out;
  for (const d = new Date(today); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay(); // 0 = Sunday, 3 = Wednesday
    if (day === 0 || day === 3) {
      out.push({ date: localDateStr(d), title: day === 0 ? "Sunday Service" : "Wednesday Service" });
    }
  }
  return out;
}

export default function SchedulePageClient() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New schedule form state
  const [newDate, setNewDate] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Track which schedule has the assign form open
  const [assigningScheduleId, setAssigningScheduleId] = useState<string | null>(
    null
  );

  // Track which schedules are being deleted
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Guard: the regular-service pre-fill must run at most once per mount, otherwise
  // React's double-invoked effects (dev) or overlapping loads create duplicate
  // schedule rows for the same date.
  const prefilledRef = useRef(false);

  // Guard: the one-time duplicate cleanup must run at most once per mount.
  const cleanedRef = useRef(false);

  // Today's local date boundary — past services drop off the schedule once the
  // day passes. Set in an effect (not at render) to avoid SSR/hydration drift.
  const [todayStr, setTodayStr] = useState("");
  useEffect(() => { setTodayStr(localDateStr(new Date())); }, []);

  // Load schedules
  const loadSchedules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/branch/schedules");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load schedules");
        return;
      }
      let list: Schedule[] = Array.isArray(data) ? data : [];

      // Pre-fill the upcoming regular Wednesday & Sunday services (create any missing ones).
      // Only ever attempt this once per mount — see prefilledRef above.
      const existingDates = new Set(list.map((s) => s.service_date));
      const missing = prefilledRef.current
        ? []
        : nextRegularServices().filter((r) => !existingDates.has(r.date));
      if (!prefilledRef.current) prefilledRef.current = true;
      if (missing.length > 0) {
        const created = await Promise.all(
          missing.map(async (r) => {
            try {
              const cr = await fetch("/api/branch/schedules", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ service_date: r.date, title: r.title }),
              });
              if (!cr.ok) return null;
              const row = await cr.json();
              return { ...row, assignments: [] } as Schedule;
            } catch {
              return null;
            }
          })
        );
        list = [...list, ...created.filter((s): s is Schedule => s !== null)];
      }

      // One-time cleanup of leftover duplicate rows for the same date. For each date
      // we keep the richest row (most assignments) and delete only the EMPTY
      // duplicates, so no assigned outfit is ever lost. A duplicate that still holds
      // outfits is left alone (it just merges into the day's card on screen).
      if (!cleanedRef.current) {
        cleanedRef.current = true;
        const byDate = new Map<string, Schedule[]>();
        for (const s of list) {
          const arr = byDate.get(s.service_date) ?? [];
          arr.push(s);
          byDate.set(s.service_date, arr);
        }
        const toDelete: string[] = [];
        for (const rows of byDate.values()) {
          if (rows.length < 2) continue;
          const [, ...rest] = [...rows].sort(
            (a, b) =>
              b.assignments.length - a.assignments.length || a.id.localeCompare(b.id)
          );
          for (const r of rest) {
            if (r.assignments.length === 0) toDelete.push(r.id);
          }
        }
        if (toDelete.length > 0) {
          const del = new Set(toDelete);
          await Promise.all(
            toDelete.map((id) =>
              fetch(`/api/branch/schedules/${id}`, { method: "DELETE" }).catch(() => null)
            )
          );
          list = list.filter((s) => !del.has(s.id));
        }
      }

      list.sort(
        (a, b) => new Date(a.service_date).getTime() - new Date(b.service_date).getTime()
      );
      setSchedules(list);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  // Create schedule
  async function handleCreateSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!newDate || !newTitle.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/branch/schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_date: newDate,
          title: newTitle.trim(),
          notes: newNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.error ?? "Failed to create schedule");
        return;
      }
      setSchedules((prev) =>
        [...prev, { ...data, assignments: [] }].sort(
          (a, b) =>
            new Date(a.service_date).getTime() -
            new Date(b.service_date).getTime()
        )
      );
      setNewDate("");
      setNewTitle("");
      setNewNotes("");
    } catch {
      setCreateError("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  // Delete every schedule row for a calendar day (handles merged duplicates)
  async function handleDeleteGroup(ids: string[]) {
    if (
      !confirm(
        "Delete this service date and all its assignments? This cannot be undone."
      )
    )
      return;
    setDeletingIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    try {
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(`/api/branch/schedules/${id}`, { method: "DELETE" });
            return res.ok ? id : null;
          } catch {
            return null;
          }
        })
      );
      const deleted = new Set(results.filter((id): id is string => id !== null));
      if (deleted.size > 0) {
        setSchedules((prev) => prev.filter((s) => !deleted.has(s.id)));
      }
      if (deleted.size < ids.length) {
        alert("Some service rows could not be deleted. Please retry.");
      }
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  }

  // Remove assignment
  async function handleRemoveAssignment(
    scheduleId: string,
    departmentId: string,
    gender: string | undefined,
    assignmentId: string
  ) {
    try {
      const res = await fetch(
        `/api/branch/schedules/${scheduleId}/assignments`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ department_id: departmentId, gender }),
        }
      );
      if (res.ok) {
        setSchedules((prev) =>
          prev.map((s) =>
            s.id === scheduleId
              ? {
                  ...s,
                  assignments: s.assignments.filter(
                    (a) => a.id !== assignmentId
                  ),
                }
              : s
          )
        );
      } else {
        const data = await res.json();
        alert(data.error ?? "Failed to remove assignment");
      }
    } catch {
      alert("Network error. Please try again.");
    }
  }

  // Handle new assignment
  function handleAssigned(scheduleId: string, assignment: Assignment) {
    setSchedules((prev) =>
      prev.map((s) => {
        if (s.id !== scheduleId) return s;
        const others = s.assignments.filter(
          (a) => a.department_id !== assignment.department_id || a.gender !== assignment.gender
        );
        return { ...s, assignments: [...others, assignment] };
      })
    );
    setAssigningScheduleId(null);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  // Hide services whose date has already passed (today's service stays until the
  // day is over). Rows remain in the DB — they're just no longer shown here.
  const visibleSchedules = todayStr
    ? schedules.filter((s) => s.service_date >= todayStr)
    : schedules;

  // Collapse to ONE card per calendar day. If duplicate schedule rows exist for the
  // same date (legacy data), merge their department outfits into a single card.
  // Each assignment carries `_scheduleId` so removals hit the right underlying row,
  // and `ids` lists every row for the date so deletion clears them all.
  const groupedByDate = (() => {
    const map = new Map<string, GroupedSchedule>();
    for (const s of visibleSchedules) {
      const g = map.get(s.service_date);
      const tagged = s.assignments.map((a) => ({ ...a, _scheduleId: s.id }));
      if (!g) {
        map.set(s.service_date, {
          id: s.id,
          ids: [s.id],
          service_date: s.service_date,
          title: s.title,
          notes: s.notes,
          assignments: tagged,
        });
      } else {
        g.ids.push(s.id);
        // Dedupe by department + gender — first row wins if a legacy duplicate exists.
        for (const a of tagged) {
          if (!g.assignments.some((x) => x.department_id === a.department_id && x.gender === a.gender)) {
            g.assignments.push(a);
          }
        }
        if (!g.notes && s.notes) g.notes = s.notes;
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(a.service_date).getTime() - new Date(b.service_date).getTime()
    );
  })();

  return (
    <div className="spc-root">
      <style>{`
        /* ── Root ── */
        .spc-root {
          max-width: 860px;
          margin: 0 auto;
        }

        /* ── Page header (masthead) ── */
        .spc-page-header {
          border-bottom: 1.5px solid var(--color-text-primary);
          padding-bottom: 0.875rem;
          margin-bottom: 1.75rem;
        }
        .spc-eyebrow {
          font-size: 0.625rem; letter-spacing: 0.3em; text-transform: uppercase;
          font-weight: 700; color: var(--color-accent); margin-bottom: 6px;
        }
        .spc-page-title {
          font-family: var(--font-heading);
          font-size: 2rem;
          font-weight: 300;
          letter-spacing: -0.02em;
          color: var(--color-text-primary);
          margin: 0 0 4px;
        }
        .spc-page-subtitle {
          font-size: 0.88rem;
          color: var(--color-text-muted);
          margin: 0;
        }

        /* ── Create form card ── */
        .spc-create-card {
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-card);
          padding: 24px;
          margin-bottom: 32px;
        }
        .spc-create-card-title {
          font-family: var(--font-heading);
          font-size: 1.3rem;
          font-weight: 400;
          letter-spacing: -0.01em;
          color: var(--color-text-primary);
          margin: 0 0 16px;
        }
        .spc-form-grid {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: 12px;
          margin-bottom: 12px;
        }
        @media (max-width: 600px) {
          .spc-form-grid { grid-template-columns: 1fr; }
        }
        .spc-label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--color-text-secondary);
          margin-bottom: 4px;
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        .spc-input, .spc-textarea, .spc-select {
          width: 100%;
          padding: 9px 12px;
          border: 1.5px solid var(--color-border);
          border-radius: var(--radius-md);
          font-size: 0.9rem;
          font-family: var(--font-body);
          background: var(--color-bg-primary);
          color: var(--color-text-primary);
          transition: border-color 0.15s, box-shadow 0.15s;
          outline: none;
        }
        .spc-input:focus, .spc-textarea:focus, .spc-select:focus {
          border-color: var(--color-primary-dark);
          box-shadow: 0 0 0 3px rgba(71,39,67,0.12);
        }
        .spc-textarea {
          resize: vertical;
          min-height: 72px;
        }
        .spc-select {
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M2 4l4 4 4-4' fill='none' stroke='%237A7890' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
          padding-right: 32px;
          cursor: pointer;
        }

        /* ── Buttons ── */
        .spc-btn {
          padding: 9px 20px;
          border-radius: var(--radius-full);
          font-size: 0.875rem;
          font-weight: 600;
          font-family: var(--font-body);
          cursor: pointer;
          border: none;
          transition: all 0.15s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          text-decoration: none;
        }
        .spc-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .spc-btn-primary {
          background: var(--color-primary-dark);
          color: #fff;
        }
        .spc-btn-primary:hover:not(:disabled) { background: #35202F; transform: translateY(-1px); }
        .spc-btn-ghost {
          background: transparent;
          color: var(--color-text-secondary);
          border: 1.5px solid var(--color-border);
        }
        .spc-btn-ghost:hover:not(:disabled) { background: var(--color-bg-elevated); }
        .spc-btn-danger {
          background: transparent;
          color: var(--color-error);
          border: 1.5px solid var(--color-error);
          padding: 5px 12px;
          font-size: 0.8rem;
        }
        .spc-btn-danger:hover:not(:disabled) { background: var(--color-error-bg); }
        .spc-btn-sm {
          padding: 6px 12px;
          font-size: 0.8rem;
        }
        .spc-form-actions {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          margin-top: 4px;
        }
        .spc-error-text {
          font-size: 0.85rem;
          color: var(--color-error);
          margin: 8px 0 0;
        }

        /* ── Schedule card ── */
        .spc-schedule-card {
          background: var(--color-bg-card);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-card);
          margin-bottom: 20px;
          overflow: hidden;
          transition: box-shadow 0.2s;
        }
        .spc-schedule-card:hover { box-shadow: var(--shadow-elevated); }
        .spc-schedule-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          padding: 20px 20px 16px;
          border-bottom: 1px solid var(--color-border-subtle);
        }
        .spc-schedule-meta { flex: 1 1 auto; min-width: 0; }
        .spc-date-badge {
          display: inline-block;
          background: var(--color-primary-light);
          color: var(--color-primary-dark);
          font-size: 0.62rem;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: var(--radius-full);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .spc-schedule-title-text {
          font-family: var(--font-heading);
          font-size: 1.25rem;
          font-weight: 500;
          letter-spacing: -0.01em;
          color: var(--color-text-primary);
          margin: 0 0 4px;
        }
        .spc-schedule-notes-text {
          font-size: 0.85rem;
          color: var(--color-text-muted);
          margin: 0;
        }
        .spc-schedule-actions {
          display: flex;
          gap: 8px;
          flex-shrink: 0;
        }

        /* ── Assignments section ── */
        .spc-assignments-section {
          padding: 16px 20px 20px;
        }
        .spc-assignments-empty {
          font-size: 0.85rem;
          color: var(--color-text-muted);
          padding: 8px 0 12px;
        }
        .spc-assignment-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          background: var(--color-bg-primary);
          border: 1px solid var(--color-border-subtle);
          border-radius: var(--radius-md);
          margin-bottom: 8px;
          transition: background 0.15s;
        }
        .spc-assignment-row:hover { background: var(--color-bg-elevated); }
        .spc-assignment-dept {
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--color-text-secondary);
          min-width: 120px;
          flex-shrink: 0;
        }
        .spc-assignment-combo {
          flex: 1 1 auto;
          min-width: 0;
        }
        .spc-assignment-combo-name {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--color-text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .spc-assignment-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        /* ── Video previews inside assignment ── */
        .spc-assignment-previews {
          display: flex;
          gap: 10px;
          flex-shrink: 0;
        }
        .spc-preview-thumb {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }
        .spc-preview-label {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .spc-preview-video {
          width: 48px;
          height: 64px;
          object-fit: cover;
          border-radius: 6px;
          border: 1.5px solid var(--color-border);
          background: var(--color-bg-elevated);
        }
        .spc-preview-download {
          font-size: 0.68rem;
          font-weight: 700;
          color: var(--color-primary-dark);
          text-decoration: none;
          border-bottom: 1px solid currentColor;
          line-height: 1;
        }

        /* ── Status badge ── */
        .spc-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: var(--radius-full);
          font-size: 0.75rem;
          font-weight: 600;
          white-space: nowrap;
        }
        .badge-success { background: var(--color-success-bg); color: var(--color-success); }
        .badge-warning { background: var(--color-warning-bg); color: var(--color-warning); }
        .badge-error   { background: var(--color-error-bg);   color: var(--color-error);   }
        .badge-neutral { background: var(--color-bg-elevated); color: var(--color-text-muted); }

        /* ── Assign form (inline) ── */
        .spc-assign-form {
          background: var(--color-bg-elevated);
          border: 1.5px solid var(--color-primary);
          border-radius: var(--radius-md);
          padding: 16px;
          margin-top: 12px;
        }
        .spc-assign-form-title {
          font-size: 0.9rem;
          font-weight: 700;
          color: var(--color-text-primary);
          margin: 0 0 12px;
        }
        .spc-form-row {
          margin-bottom: 10px;
        }
        .spc-select-skeleton {
          height: 38px;
          border-radius: var(--radius-md);
        }
        .spc-assign-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
          margin-top: 4px;
        }
        .spc-error-inline {
          font-size: 0.83rem;
          color: var(--color-error);
          margin: 0 0 10px;
        }

        /* ── Add assign button ── */
        .spc-add-assign-btn {
          margin-top: 8px;
        }

        /* ── Empty state ── */
        .spc-empty-state {
          text-align: center;
          padding: 56px 24px;
        }
        .spc-empty-icon {
          font-size: 3rem;
          display: block;
          margin-bottom: 12px;
        }
        .spc-empty-title {
          font-size: 1.1rem;
          font-weight: 700;
          color: var(--color-text-primary);
          margin: 0 0 6px;
        }
        .spc-empty-text {
          font-size: 0.9rem;
          color: var(--color-text-muted);
          margin: 0;
        }

        /* ── Loading / Error ── */
        .spc-page-loading {
          text-align: center;
          padding: 64px 24px;
          color: var(--color-text-muted);
        }
        .spc-page-error {
          background: var(--color-error-bg);
          border: 1px solid var(--color-error);
          border-radius: var(--radius-md);
          padding: 14px 18px;
          color: var(--color-error);
          font-size: 0.9rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 24px;
        }
      `}</style>

      {/* Page header */}
      <div className="spc-page-header">
        <div className="spc-eyebrow">The Calendar</div>
        <h1 className="spc-page-title">Schedule</h1>
        <p className="spc-page-subtitle">
          Wednesday &amp; Sunday services appear automatically. Assign a look to each department.
        </p>
        <div style={{ marginTop: "1rem" }}>
          <PublicScheduleShareButton className="spc-btn spc-btn-primary" />
        </div>
      </div>

      {/* Create a special / one-off service */}
      <div className="spc-create-card">
        <h2 className="spc-create-card-title">Add a special service</h2>
        <p className="spc-page-subtitle" style={{ marginTop: -6, marginBottom: 12 }}>
          For anything outside the regular Wednesday &amp; Sunday services.
        </p>
        <form onSubmit={handleCreateSchedule}>
          <div className="spc-form-grid">
            <div>
              <label className="spc-label" htmlFor="new-date">
                Date
              </label>
              <input
                id="new-date"
                type="date"
                className="spc-input"
                value={newDate}
                min={todayStr || undefined}
                onChange={(e) => setNewDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="spc-label" htmlFor="new-title">
                Title
              </label>
              <input
                id="new-title"
                type="text"
                className="spc-input"
                placeholder="e.g. Easter Sunday, Convention Night"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                required
                maxLength={120}
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="spc-label" htmlFor="new-notes">
              Notes (optional)
            </label>
            <textarea
              id="new-notes"
              className="spc-textarea"
              placeholder="Any special notes for this service date…"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
            />
          </div>
          {createError && <p className="spc-error-text">{createError}</p>}
          <div className="spc-form-actions">
            <button
              type="submit"
              className="spc-btn spc-btn-primary"
              disabled={creating || !newDate || !newTitle.trim()}
            >
              {creating ? "Creating…" : "＋ Add special service"}
            </button>
          </div>
        </form>
      </div>

      {/* Error banner */}
      {error && (
        <div className="spc-page-error">
          <span>⚠ {error}</span>
          <button
            className="spc-btn spc-btn-ghost spc-btn-sm"
            onClick={loadSchedules}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="spc-page-loading">
          <div
            className="skeleton"
            style={{ height: 140, borderRadius: 16, marginBottom: 16 }}
          />
          <div
            className="skeleton"
            style={{ height: 140, borderRadius: 16, marginBottom: 16 }}
          />
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && visibleSchedules.length === 0 && (
        <div className="spc-empty-state">
          <span className="spc-empty-icon">📅</span>
          <p className="spc-empty-title">No upcoming service dates</p>
          <p className="spc-empty-text">
            Add your first one using the form above.
          </p>
        </div>
      )}

      {/* Schedule list — one card per calendar day */}
      {!loading &&
        groupedByDate.map((schedule) => {
          const isDeleting = schedule.ids.some((id) => deletingIds.has(id));
          const isAssigning = assigningScheduleId === schedule.id;
          const formattedDate = new Date(
            schedule.service_date + "T00:00:00"
          ).toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          });

          return (
            <div
              key={schedule.id}
              className="spc-schedule-card"
              style={{ opacity: isDeleting ? 0.5 : 1 }}
            >
              {/* Card header */}
              <div className="spc-schedule-card-header">
                <div className="spc-schedule-meta">
                  <div className="spc-date-badge">{formattedDate}</div>
                  <p className="spc-schedule-title-text">{schedule.title}</p>
                  {schedule.notes && (
                    <p className="spc-schedule-notes-text">{schedule.notes}</p>
                  )}
                </div>
                <div className="spc-schedule-actions">
                  <a
                    className="spc-btn spc-btn-ghost spc-btn-sm"
                    href={`/api/branch/schedules/${schedule.id}/package`}
                  >
                    Download package
                  </a>
                  <button
                    className="spc-btn spc-btn-danger"
                    onClick={() => handleDeleteGroup(schedule.ids)}
                    disabled={isDeleting}
                    title="Delete this service date"
                  >
                    {isDeleting ? "Deleting…" : "🗑 Delete"}
                  </button>
                </div>
              </div>

              {/* Assignments */}
              <div className="spc-assignments-section">
                {schedule.assignments.length === 0 && !isAssigning && (
                  <p className="spc-assignments-empty">
                    No outfits assigned to this service date yet.
                  </p>
                )}

                {schedule.assignments.map((a) => {
                  const preview = getAssignmentPreview(a);
                  return (
                  <div key={a.id} className="spc-assignment-row">
                    <div className="spc-assignment-dept">
                      {a.department?.name ?? "—"}
                    </div>
                    <div className="spc-assignment-combo">
                      <div className="spc-assignment-combo-name">
                        {a.combination?.name ?? "—"}
                      </div>
                      {a.gender && (
                        <div style={{ fontSize: "0.72rem", color: "var(--color-text-muted)", textTransform: "capitalize" }}>
                          {a.gender}
                        </div>
                      )}
                    </div>
                    <div className="spc-assignment-right">
                      {/* Preview */}
                      {a.combination?.preview_status === "ready" && preview ? (
                        <div className="spc-assignment-previews">
                          <div className="spc-preview-thumb">
                            <span className="spc-preview-label">{preview.gender === "male" ? "M" : "F"}</span>
                            {preview.isVideo ? (
                              <video
                                src={preview.url}
                                autoPlay
                                loop
                                muted
                                playsInline
                                className="spc-preview-video"
                              />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={preview.url} alt={`${a.combination.name} ${preview.gender} preview`} className="spc-preview-video" />
                            )}
                            <a
                              href={`/api/branch/combinations/${a.combination.id}/download?gender=${preview.gender}`}
                              className="spc-preview-download"
                            >
                              Download
                            </a>
                          </div>
                        </div>
                      ) : (
                        <PreviewBadge
                          status={a.combination?.preview_status ?? "none"}
                        />
                      )}
                      <button
                        className="spc-btn spc-btn-danger"
                        onClick={() =>
                          handleRemoveAssignment(
                            a._scheduleId,
                            a.department_id,
                            a.gender ?? undefined,
                            a.id
                          )
                        }
                        title="Remove this assignment"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  );
                })}

                {/* Inline assign form */}
                {isAssigning ? (
                  <AssignForm
                    scheduleId={schedule.id}
                    existingAssignments={schedule.assignments}
                    onAssigned={(assignment) =>
                      handleAssigned(schedule.id, assignment)
                    }
                    onCancel={() => setAssigningScheduleId(null)}
                  />
                ) : (
                  <button
                    className="spc-btn spc-btn-ghost spc-btn-sm spc-add-assign-btn"
                    onClick={() => setAssigningScheduleId(schedule.id)}
                  >
                    ＋ Assign Department Outfit
                  </button>
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
}
