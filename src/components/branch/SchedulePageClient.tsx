"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Department {
  id: string;
  name: string;
}

interface Combination {
  id: string;
  name: string;
  department_id: string;
  preview_status: "none" | "processing" | "ready" | "failed";
  male_gif_url: string | null;
  female_gif_url: string | null;
}

interface Assignment {
  id: string;
  department_id: string;
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
    if (!selectedDeptId) {
      setCombinations([]);
      setSelectedComboId("");
      return;
    }
    setLoadingCombos(true);
    setSelectedComboId("");
    fetch(`/api/branch/combinations?department_id=${selectedDeptId}`)
      .then((r) => r.json())
      .then((data: Combination[]) => {
        // Filter to matching department
        const filtered = Array.isArray(data)
          ? data.filter((c) => c.department_id === selectedDeptId)
          : [];
        setCombinations(filtered);
      })
      .catch(() => setError("Failed to load combinations"))
      .finally(() => setLoadingCombos(false));
  }, [selectedDeptId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDeptId || !selectedComboId) return;
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
            onChange={(e) => setSelectedDeptId(e.target.value)}
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
            disabled={!selectedDeptId}
          >
            <option value="">
              {selectedDeptId
                ? combinations.length === 0
                  ? "No combinations for this department"
                  : "Select combination…"
                : "Select a department first"}
            </option>
            {combinations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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
          disabled={loading || !selectedDeptId || !selectedComboId}
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

// ─── Main Component ───────────────────────────────────────────────────────────

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
      setSchedules(Array.isArray(data) ? data : []);
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

  // Delete schedule
  async function handleDeleteSchedule(scheduleId: string) {
    if (
      !confirm(
        "Delete this service date and all its assignments? This cannot be undone."
      )
    )
      return;
    setDeletingIds((prev) => new Set(prev).add(scheduleId));
    try {
      const res = await fetch(`/api/branch/schedules/${scheduleId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
      } else {
        const data = await res.json();
        alert(data.error ?? "Failed to delete schedule");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(scheduleId);
        return next;
      });
    }
  }

  // Remove assignment
  async function handleRemoveAssignment(
    scheduleId: string,
    departmentId: string,
    assignmentId: string
  ) {
    try {
      const res = await fetch(
        `/api/branch/schedules/${scheduleId}/assignments`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ department_id: departmentId }),
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
          (a) => a.department_id !== assignment.department_id
        );
        return { ...s, assignments: [...others, assignment] };
      })
    );
    setAssigningScheduleId(null);
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="spc-root">
      <style>{`
        /* ── Root ── */
        .spc-root {
          padding: 32px;
          max-width: 900px;
          margin: 0 auto;
        }

        /* ── Page header ── */
        .spc-page-header {
          margin-bottom: 28px;
        }
        .spc-page-title {
          font-size: 1.75rem;
          font-weight: 700;
          color: var(--color-text-primary);
          margin: 0 0 4px;
        }
        .spc-page-subtitle {
          font-size: 0.9rem;
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
          font-size: 1rem;
          font-weight: 600;
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
          box-shadow: 0 0 0 3px rgba(124,92,191,0.12);
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
          padding: 9px 18px;
          border-radius: var(--radius-md);
          font-size: 0.875rem;
          font-weight: 600;
          font-family: var(--font-body);
          cursor: pointer;
          border: none;
          transition: all 0.15s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .spc-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .spc-btn-primary {
          background: linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%);
          color: #fff;
        }
        .spc-btn-primary:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
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
          background: linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%);
          color: #fff;
          font-size: 0.78rem;
          font-weight: 700;
          padding: 3px 10px;
          border-radius: var(--radius-full);
          letter-spacing: 0.03em;
          margin-bottom: 6px;
        }
        .spc-schedule-title-text {
          font-size: 1.1rem;
          font-weight: 700;
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
        <h1 className="spc-page-title">📅 Service Schedule</h1>
        <p className="spc-page-subtitle">
          Manage upcoming service dates and assign outfit combinations to
          departments.
        </p>
      </div>

      {/* Create new schedule */}
      <div className="spc-create-card">
        <h2 className="spc-create-card-title">Add New Service Date</h2>
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
                placeholder="e.g. Sunday Morning Service"
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
              {creating ? "Creating…" : "＋ Add Service Date"}
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
      {!loading && !error && schedules.length === 0 && (
        <div className="spc-empty-state">
          <span className="spc-empty-icon">📅</span>
          <p className="spc-empty-title">No service dates scheduled yet</p>
          <p className="spc-empty-text">
            Add your first one using the form above.
          </p>
        </div>
      )}

      {/* Schedule list */}
      {!loading &&
        schedules.map((schedule) => {
          const isDeleting = deletingIds.has(schedule.id);
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
                  <button
                    className="spc-btn spc-btn-danger"
                    onClick={() => handleDeleteSchedule(schedule.id)}
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

                {schedule.assignments.map((a) => (
                  <div key={a.id} className="spc-assignment-row">
                    <div className="spc-assignment-dept">
                      {a.department?.name ?? "—"}
                    </div>
                    <div className="spc-assignment-combo">
                      <div className="spc-assignment-combo-name">
                        {a.combination?.name ?? "—"}
                      </div>
                    </div>
                    <div className="spc-assignment-right">
                      {/* Previews */}
                      {a.combination?.preview_status === "ready" ? (
                        <div className="spc-assignment-previews">
                          <div className="spc-preview-thumb">
                            <span className="spc-preview-label">M</span>
                            <video
                              src={a.combination.male_gif_url ?? undefined}
                              autoPlay
                              loop
                              muted
                              playsInline
                              className="spc-preview-video"
                            />
                          </div>
                          <div className="spc-preview-thumb">
                            <span className="spc-preview-label">F</span>
                            <video
                              src={a.combination.female_gif_url ?? undefined}
                              autoPlay
                              loop
                              muted
                              playsInline
                              className="spc-preview-video"
                            />
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
                            schedule.id,
                            a.department_id,
                            a.id
                          )
                        }
                        title="Remove this assignment"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}

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
