"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Users } from "lucide-react";
import DepartmentCard from "@/components/branch/DepartmentCard";
import type { DepartmentWithCounts, DepartmentMember } from "@/types/database";

export default function DepartmentsPageClient() {
  const [departments, setDepartments] = useState<DepartmentWithCounts[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchDepartments = useCallback(async () => {
    try {
      const res = await fetch("/api/branch/departments");
      const data = await res.json();
      setDepartments(Array.isArray(data) ? data : []);
    } catch {
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDepartments(); }, [fetchDepartments]);

  async function handleCreate() {
    if (!newName.trim()) { setCreateError("Name is required"); return; }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/branch/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error ?? "Failed to create"); return; }
      // Append with zero counts
      setDepartments((prev) => [...prev, { ...data, uniform_count: 0, combination_count: 0, member_count: 0 }]);
      setNewName(""); setNewDesc(""); setShowCreate(false);
    } catch {
      setCreateError("Failed to create department");
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdate(id: string, name: string, description: string | null) {
    const res = await fetch(`/api/branch/departments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to update");
    setDepartments((prev) => prev.map((d) => d.id === id ? { ...d, name, description } : d));
  }

  async function handleDelete(id: string): Promise<string | null> {
    const res = await fetch(`/api/branch/departments/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return data.error ?? "Failed to delete";
    setDepartments((prev) => prev.filter((d) => d.id !== id));
    return null;
  }

  async function handleAddMember(departmentId: string, name: string): Promise<DepartmentMember | null> {
    const res = await fetch(`/api/branch/departments/${departmentId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return null;
    const member = await res.json();
    // Increment member count in list
    setDepartments((prev) => prev.map((d) => d.id === departmentId ? { ...d, member_count: d.member_count + 1 } : d));
    return member;
  }

  async function handleRemoveMember(departmentId: string, memberId: string) {
    await fetch(`/api/branch/departments/${departmentId}/members/${memberId}`, { method: "DELETE" });
    setDepartments((prev) => prev.map((d) => d.id === departmentId ? { ...d, member_count: Math.max(0, d.member_count - 1) } : d));
  }

  if (loading) return null; // loading.tsx handles the skeleton

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.75rem", marginBottom: "0.25rem" }}>
            Departments
          </h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            Manage your branch departments and their members.
          </p>
        </div>
        <button
          id="create-department-btn"
          onClick={() => { setShowCreate(true); setCreateError(null); }}
          style={{
            display: "flex", alignItems: "center", gap: "0.5rem",
            padding: "0.65rem 1.25rem", borderRadius: "var(--radius-md)",
            background: "linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%)",
            color: "#fff", border: "none", fontWeight: 600, fontSize: "0.875rem", cursor: "pointer",
          }}
        >
          <Plus size={15} /> New Department
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>
            New Department
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>
                Name <span style={{ color: "var(--color-error)" }}>*</span>
              </label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => { setNewName(e.target.value); setCreateError(null); }}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="e.g. Ushers, Choir, Media Team"
                maxLength={100}
                style={{
                  width: "100%", border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem",
                  fontSize: "0.9rem", outline: "none",
                }}
                onFocus={(e) => { e.target.style.borderColor = "var(--color-primary-dark)"; e.target.style.boxShadow = "0 0 0 3px rgba(155,135,245,0.15)"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--color-border)"; e.target.style.boxShadow = "none"; }}
              />
            </div>
            <div>
              <label style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--color-text-secondary)", display: "block", marginBottom: "0.35rem" }}>
                Description <span style={{ color: "var(--color-text-disabled)" }}>(optional)</span>
              </label>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Brief description of this department"
                maxLength={200}
                style={{
                  width: "100%", border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem",
                  fontSize: "0.875rem", outline: "none",
                }}
                onFocus={(e) => { e.target.style.borderColor = "var(--color-primary-dark)"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--color-border)"; }}
              />
            </div>
            {createError && (
              <p style={{ color: "var(--color-error)", fontSize: "0.82rem", margin: 0 }}>{createError}</p>
            )}
            <div style={{ display: "flex", gap: "0.625rem" }}>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                style={{
                  padding: "0.6rem 1.25rem", borderRadius: "var(--radius-md)",
                  background: "linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%)",
                  color: "#fff", border: "none", fontWeight: 600, fontSize: "0.875rem",
                  cursor: creating || !newName.trim() ? "not-allowed" : "pointer",
                  opacity: creating || !newName.trim() ? 0.65 : 1,
                }}
              >
                {creating ? "Creating…" : "Create Department"}
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewName(""); setNewDesc(""); setCreateError(null); }}
                style={{
                  padding: "0.6rem 1rem", borderRadius: "var(--radius-md)",
                  background: "transparent", border: "1px solid var(--color-border)",
                  fontSize: "0.875rem", cursor: "pointer", color: "var(--color-text-muted)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {departments.length === 0 && !showCreate && (
        <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <div style={{
            width: 64, height: 64, borderRadius: "var(--radius-lg)",
            background: "var(--color-primary-light)", border: "1px solid rgba(155,135,245,0.2)",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem",
          }}>
            <Users size={28} color="var(--color-primary-dark)" />
          </div>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.25rem", marginBottom: "0.5rem" }}>
            No departments yet
          </h2>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", maxWidth: 360, margin: "0 auto 1.5rem" }}>
            Create your first department to start organising uniforms and members.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: "0.5rem",
              padding: "0.65rem 1.25rem", borderRadius: "var(--radius-md)",
              background: "linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%)",
              color: "#fff", border: "none", fontWeight: 600, fontSize: "0.875rem", cursor: "pointer",
            }}
          >
            <Plus size={15} /> Create First Department
          </button>
        </div>
      )}

      {/* Department cards */}
      {departments.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {departments.map((dept) => (
            <DepartmentCard
              key={dept.id}
              department={dept}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              onAddMember={handleAddMember}
              onRemoveMember={handleRemoveMember}
            />
          ))}
        </div>
      )}
    </div>
  );
}
