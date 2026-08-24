"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Trash2, X, Plus, Check, AlertTriangle } from "lucide-react";
import type { DepartmentWithCounts, DepartmentMember } from "@/types/database";

interface DepartmentCardProps {
  department: DepartmentWithCounts;
  onUpdate: (id: string, name: string, description: string | null) => Promise<void>;
  onDelete: (id: string) => Promise<string | null>; // returns error message or null
  onAddMember: (departmentId: string, name: string, gender: "male" | "female") => Promise<DepartmentMember | null>;
  onRemoveMember: (departmentId: string, memberId: string) => Promise<void>;
}

export default function DepartmentCard({
  department,
  onUpdate,
  onDelete,
  onAddMember,
  onRemoveMember,
}: DepartmentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [members, setMembers] = useState<DepartmentMember[] | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(department.name);
  const [editDesc, setEditDesc] = useState(department.description ?? "");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Add member state
  const [memberName, setMemberName] = useState("");
  const [memberGender, setMemberGender] = useState<"male" | "female">("male");
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  async function handleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && members === null) {
      setLoadingMembers(true);
      try {
        const res = await fetch(`/api/branch/departments/${department.id}/members`);
        const data = await res.json();
        setMembers(Array.isArray(data) ? data : []);
      } catch {
        setMembers([]);
      } finally {
        setLoadingMembers(false);
      }
    }
  }

  async function handleEdit() {
    if (!editName.trim()) { setEditError("Name is required"); return; }
    setEditLoading(true);
    setEditError(null);
    try {
      await onUpdate(department.id, editName.trim(), editDesc.trim() || null);
      setEditing(false);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete() {
    setDeleteLoading(true);
    setDeleteError(null);
    const err = await onDelete(department.id);
    if (err) {
      setDeleteError(err);
      setDeleteConfirm(false);
    }
    setDeleteLoading(false);
  }

  async function handleAddMember() {
    if (!memberName.trim()) { setMemberError("Name is required"); return; }
    setAddingMember(true);
    setMemberError(null);
    const member = await onAddMember(department.id, memberName.trim(), memberGender);
    if (member) {
      setMembers((prev) => [...(prev ?? []), member].sort((a, b) => a.name.localeCompare(b.name)));
      setMemberName("");
    } else {
      setMemberError("Failed to add member");
    }
    setAddingMember(false);
  }

  async function handleRemoveMember(memberId: string) {
    await onRemoveMember(department.id, memberId);
    setMembers((prev) => (prev ?? []).filter((m) => m.id !== memberId));
  }

  const countBadge = (label: string, count: number, color: string) => (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "0.3rem",
      fontSize: "0.75rem", fontWeight: 500,
      padding: "0.2rem 0.6rem",
      borderRadius: "var(--radius-full)",
      background: `${color}15`,
      color: color,
      border: `1px solid ${color}30`,
    }}>
      {count} {label}
    </span>
  );

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {/* ── Card Header ── */}
      <div style={{ padding: "1.25rem 1.5rem" }}>
        {editing ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Department name"
              autoFocus
              style={{
                border: "1px solid var(--color-primary-dark)",
                borderRadius: "var(--radius-md)",
                padding: "0.5rem 0.75rem",
                fontSize: "0.9rem",
                outline: "none",
                width: "100%",
              }}
            />
            <input
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder="Description (optional)"
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "0.5rem 0.75rem",
                fontSize: "0.875rem",
                outline: "none",
                width: "100%",
              }}
            />
            {editError && (
              <p style={{ color: "var(--color-error)", fontSize: "0.8rem", margin: 0 }}>{editError}</p>
            )}
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={handleEdit}
                disabled={editLoading}
                style={{
                  display: "flex", alignItems: "center", gap: "0.375rem",
                  padding: "0.45rem 0.875rem", borderRadius: "var(--radius-md)",
                  background: "var(--color-primary-dark)", color: "#fff",
                  border: "none", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
                }}
              >
                <Check size={13} /> Save
              </button>
              <button
                onClick={() => { setEditing(false); setEditName(department.name); setEditDesc(department.description ?? ""); setEditError(null); }}
                style={{
                  padding: "0.45rem 0.875rem", borderRadius: "var(--radius-md)",
                  background: "transparent", border: "1px solid var(--color-border)",
                  fontSize: "0.82rem", cursor: "pointer", color: "var(--color-text-muted)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.4rem" }}>
                <div style={{
                  width: 38, height: 38, borderRadius: "12px",
                  background: "var(--color-primary-light)", color: "var(--color-primary-dark)",
                  display: "grid", placeItems: "center", flexShrink: 0,
                  fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: "1.2rem",
                }}>
                  {department.name.charAt(0).toUpperCase()}
                </div>
                <h3 style={{ fontFamily: "var(--font-heading)", fontSize: "1.25rem", fontWeight: 500, letterSpacing: "-0.01em", margin: 0 }}>
                  {department.name}
                </h3>
              </div>
              {department.description && (
                <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted)", margin: "0 0 0.75rem 0" }}>
                  {department.description}
                </p>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {countBadge("uniforms", department.uniform_count, "var(--color-gold)")}
                {countBadge("combinations", department.combination_count, "var(--color-info)")}
                {countBadge("members", department.member_count, "var(--color-success)")}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", flexShrink: 0 }}>
              <button
                onClick={() => { setEditing(true); setDeleteConfirm(false); setDeleteError(null); }}
                title="Edit department"
                style={{ padding: "0.4rem", borderRadius: "var(--radius-md)", border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)", display: "flex" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--color-primary-light)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => { setDeleteConfirm(true); setEditing(false); setDeleteError(null); }}
                title="Delete department"
                style={{ padding: "0.4rem", borderRadius: "var(--radius-md)", border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)", display: "flex" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-error)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-muted)")}
              >
                <Trash2 size={14} />
              </button>
              <button
                onClick={handleExpand}
                title={expanded ? "Collapse" : "Expand members"}
                style={{ padding: "0.4rem", borderRadius: "var(--radius-md)", border: "none", background: "transparent", cursor: "pointer", color: "var(--color-text-muted)", display: "flex" }}
              >
                {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
          </div>
        )}

        {/* Delete confirm / error */}
        {deleteConfirm && !editing && (
          <div style={{
            marginTop: "0.875rem", padding: "0.75rem", borderRadius: "var(--radius-md)",
            background: "var(--color-error-bg)", border: "1px solid var(--color-error)",
            fontSize: "0.82rem", color: "var(--color-error)",
          }}>
            <p style={{ margin: "0 0 0.5rem 0", fontWeight: 600 }}>Delete &quot;{department.name}&quot;?</p>
            <p style={{ margin: "0 0 0.75rem 0" }}>Members will be removed. This cannot be undone.</p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                style={{
                  padding: "0.4rem 0.875rem", borderRadius: "var(--radius-md)",
                  background: "var(--color-error)", color: "#fff",
                  border: "none", fontSize: "0.82rem", fontWeight: 600, cursor: "pointer",
                }}
              >
                {deleteLoading ? "Deleting…" : "Delete"}
              </button>
              <button
                onClick={() => { setDeleteConfirm(false); setDeleteError(null); }}
                style={{
                  padding: "0.4rem 0.875rem", borderRadius: "var(--radius-md)",
                  background: "transparent", border: "1px solid var(--color-error)",
                  fontSize: "0.82rem", cursor: "pointer", color: "var(--color-error)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {deleteError && (
          <div style={{
            marginTop: "0.75rem", padding: "0.65rem 0.875rem",
            borderRadius: "var(--radius-md)", background: "var(--color-error-bg)",
            border: "1px solid var(--color-error)", display: "flex", gap: "0.5rem", alignItems: "flex-start",
          }}>
            <AlertTriangle size={14} color="var(--color-error)" style={{ flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: "0.82rem", color: "var(--color-error)" }}>{deleteError}</span>
            <button onClick={() => setDeleteError(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--color-error)", padding: 0 }}>
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* ── Members section (expandable) ── */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--color-border)", padding: "1rem 1.5rem", background: "var(--color-bg-primary)" }}>
          <p style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.875rem" }}>
            Members
          </p>

          {loadingMembers ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton" style={{ height: 32, borderRadius: "var(--radius-md)" }} />
              ))}
            </div>
          ) : (
            <>
              {(members ?? []).length === 0 ? (
                <p style={{ fontSize: "0.85rem", color: "var(--color-text-disabled)", marginBottom: "0.875rem" }}>
                  No members yet.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", marginBottom: "0.875rem" }}>
                  {(members ?? []).map((m) => (
                    <div key={m.id} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "0.45rem 0.75rem", borderRadius: "var(--radius-md)",
                      background: "var(--color-bg-surface)", border: "1px solid var(--color-border)",
                    }}>
                      <span style={{ fontSize: "0.875rem" }}>
                        {m.name}
                        <span style={{ color: "var(--color-text-faint)", fontSize: "0.75rem", marginLeft: "0.35rem" }}>
                          · {m.gender === "male" ? "Male" : "Female"}
                        </span>
                      </span>
                      <button
                        onClick={() => handleRemoveMember(m.id)}
                        title="Remove member"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-disabled)", display: "flex", padding: "2px" }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--color-error)")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--color-text-disabled)")}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add member form */}
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  value={memberName}
                  onChange={(e) => { setMemberName(e.target.value); setMemberError(null); }}
                  onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
                  placeholder="Member name"
                  maxLength={100}
                  style={{
                    flex: 1, border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)", padding: "0.45rem 0.75rem",
                    fontSize: "0.875rem", outline: "none",
                  }}
                  onFocus={(e) => { e.target.style.borderColor = "var(--color-primary-dark)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--color-border)"; }}
                />
                <select
                  value={memberGender}
                  onChange={(e) => setMemberGender(e.target.value as "male" | "female")}
                  style={{
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "0.45rem 0.55rem",
                    fontSize: "0.82rem",
                    background: "var(--color-bg-elevated)",
                    color: "var(--color-text-secondary)",
                    outline: "none",
                  }}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
                <button
                  onClick={handleAddMember}
                  disabled={addingMember || !memberName.trim()}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.3rem",
                    padding: "0.45rem 0.875rem", borderRadius: "var(--radius-md)",
                    background: "var(--color-primary-dark)", color: "#fff",
                    border: "none", fontSize: "0.82rem", fontWeight: 600,
                    cursor: addingMember || !memberName.trim() ? "not-allowed" : "pointer",
                    opacity: addingMember || !memberName.trim() ? 0.6 : 1,
                  }}
                >
                  <Plus size={13} /> Add
                </button>
              </div>
              {memberError && (
                <p style={{ color: "var(--color-error)", fontSize: "0.8rem", marginTop: "0.375rem" }}>{memberError}</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
