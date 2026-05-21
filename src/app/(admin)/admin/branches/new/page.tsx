"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { generateViewCode } from "@/lib/utils";

function slugify(str: string) {
  return str.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 50);
}

export default function NewBranchPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", slug: "", view_code: generateViewCode() });

  function handleNameChange(name: string) {
    setForm(f => ({ ...f, name, slug: slugify(name) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to create branch");
      setLoading(false);
      return;
    }

    router.push(`/admin/branches/${data.branch.id}`);
  }

  const inputStyle = {
    background: "var(--color-bg-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    padding: "0.65rem 0.875rem",
    color: "var(--color-text-primary)",
    fontSize: "0.9rem",
    outline: "none",
    width: "100%",
    transition: "border-color 0.15s",
  };

  return (
    <div style={{ maxWidth: 560 }}>
      {/* Back */}
      <Link href="/admin/branches" style={{
        display: "inline-flex", alignItems: "center", gap: "0.4rem",
        color: "var(--color-text-muted)", fontSize: "0.85rem", textDecoration: "none", marginBottom: "1.5rem",
      }}>
        <ArrowLeft size={15} /> Back to Branches
      </Link>

      <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.75rem", marginBottom: "0.25rem" }}>
        New Branch
      </h1>
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", marginBottom: "2rem" }}>
        Create a new church branch on the Garment platform.
      </p>

      <form onSubmit={handleSubmit} id="new-branch-form" className="card" style={{ padding: "2rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

          {/* Name */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", fontWeight: 500 }}>
              Branch Name <span style={{ color: "var(--color-error)" }}>*</span>
            </label>
            <input
              id="branch-name"
              type="text"
              required
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Grace Chapel Central"
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = "var(--color-gold)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
            />
          </div>

          {/* Slug */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", fontWeight: 500 }}>
              URL Slug <span style={{ color: "var(--color-error)" }}>*</span>
            </label>
            <div style={{ position: "relative" }}>
              <span style={{
                position: "absolute", left: "0.875rem", top: "50%", transform: "translateY(-50%)",
                color: "var(--color-text-disabled)", fontSize: "0.85rem", pointerEvents: "none",
              }}>
                garment.app/view/
              </span>
              <input
                id="branch-slug"
                type="text"
                required
                value={form.slug}
                onChange={(e) => setForm(f => ({ ...f, slug: slugify(e.target.value) }))}
                placeholder="grace-chapel-central"
                style={{ ...inputStyle, paddingLeft: "9.5rem" }}
                onFocus={(e) => (e.target.style.borderColor = "var(--color-gold)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
              />
            </div>
          </div>

          {/* View Code */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", fontWeight: 500 }}>
              Member View Code
            </label>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <input
                id="branch-view-code"
                type="text"
                value={form.view_code}
                onChange={(e) => setForm(f => ({ ...f, view_code: e.target.value.toUpperCase() }))}
                placeholder="GCC-4892"
                style={{ ...inputStyle, fontFamily: "monospace", letterSpacing: "0.08em", fontWeight: 600 }}
                onFocus={(e) => (e.target.style.borderColor = "var(--color-gold)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
              />
              <button
                type="button"
                id="regenerate-code"
                onClick={() => setForm(f => ({ ...f, view_code: generateViewCode() }))}
                style={{
                  background: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "0.65rem 1rem",
                  color: "var(--color-text-muted)",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Regenerate
              </button>
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--color-text-disabled)" }}>
              Members enter this code to view the branch schedule.
            </span>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: "var(--color-error-bg)", border: "1px solid var(--color-error)",
              borderRadius: "var(--radius-md)", padding: "0.75rem", color: "var(--color-error)", fontSize: "0.85rem",
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            id="create-branch-submit"
            type="submit"
            disabled={loading}
            style={{
              background: "linear-gradient(135deg, var(--color-gold) 0%, var(--color-gold-light) 100%)",
              color: "#FFFFFF", fontWeight: 600, fontSize: "0.9rem",
              padding: "0.75rem", borderRadius: "var(--radius-md)", border: "none",
              cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
            }}
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "Creating…" : "Create Branch"}
          </button>
        </div>
      </form>
    </div>
  );
}
