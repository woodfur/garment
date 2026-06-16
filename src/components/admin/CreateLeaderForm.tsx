"use client";

import { useState } from "react";
import { Loader2, Copy, Check, ShieldAlert, UserPlus } from "lucide-react";

interface CreateLeaderFormProps {
  branchId: string;
  branchName: string;
}

interface Credentials {
  email: string;
  password: string;
}

export default function CreateLeaderForm({ branchId, branchName }: CreateLeaderFormProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/create-leader", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, fullName, branchId }),
      });

      // Parse JSON safely — non-JSON bodies (HTML error pages) would throw here
      let data: { email?: string; password?: string; error?: string } | null = null;
      try {
        data = await res.json();
      } catch {
        setError("Unexpected server response. Please try again.");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError(data?.error || "Failed to create account");
        setLoading(false);
        return;
      }

      // Guard: validate the expected fields are present before using them
      if (!data?.email || !data?.password) {
        setError("Server returned incomplete credentials. Please try again.");
        setLoading(false);
        return;
      }

      setCredentials({ email: data.email, password: data.password });
      setLoading(false);
    } catch (err) {
      console.error("[CreateLeaderForm] handleSubmit error:", err);
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!credentials) return;
    try {
      await navigator.clipboard.writeText(credentials.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard API unavailable (non-HTTPS or browser restriction) — silently ignore
    }
  }

  function handleDone() {
    setCredentials(null);
    setEmail("");
    setFullName("");
    setError(null);
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--color-bg-primary)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    padding: "0.6rem 0.875rem",
    color: "var(--color-text-primary)",
    fontSize: "0.875rem",
    outline: "none",
    width: "100%",
    transition: "border-color 0.15s",
  };

  return (
    <>
      {/* ── Blocking credentials modal ─────────────────────────────────── */}
      {credentials && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.75)",
          backdropFilter: "blur(4px)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
        }}>
          <div style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "2rem",
            maxWidth: 460,
            width: "100%",
            boxShadow: "var(--shadow-elevated)",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
              <div style={{
                width: 42, height: 42,
                background: "var(--color-primary-light)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <UserPlus size={20} color="var(--color-primary-dark)" />
              </div>
              <div>
                <div style={{ fontWeight: 500, fontSize: "1.15rem", fontFamily: "var(--font-heading)" }}>
                  Account created
                </div>
                <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>
                  Share these credentials securely
                </div>
              </div>
            </div>

            {/* Warning */}
            <div style={{
              display: "flex", alignItems: "flex-start", gap: "0.625rem",
              background: "var(--color-warning-bg)",
              border: "1px solid var(--color-warning)",
              borderRadius: "var(--radius-md)",
              padding: "0.75rem 0.875rem",
              marginBottom: "1.25rem",
            }}>
              <ShieldAlert size={16} color="var(--color-warning)" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: "0.78rem", color: "var(--color-warning)", lineHeight: 1.5, margin: 0 }}>
                This password will <strong>not be shown again</strong>. Copy it now and share it with the branch leader securely.
              </p>
            </div>

            {/* Credentials */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
              {/* Email */}
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--color-text-disabled)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.35rem" }}>
                  Email
                </div>
                <div style={{
                  background: "var(--color-bg-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "0.6rem 0.875rem",
                  fontSize: "0.875rem",
                  color: "var(--color-text-primary)",
                }}>
                  {credentials.email}
                </div>
              </div>

              {/* Password */}
              <div>
                <div style={{ fontSize: "0.72rem", color: "var(--color-text-disabled)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.35rem" }}>
                  Temporary Password
                </div>
                <div style={{
                  display: "flex", alignItems: "center", gap: "0.5rem",
                }}>
                  <div style={{
                    flex: 1,
                    background: "var(--color-bg-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "0.6rem 0.875rem",
                    fontFamily: "monospace",
                    fontSize: "1rem",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    color: "var(--color-gold)",
                  }}>
                    {credentials.password}
                  </div>
                  <button
                    id="copy-password-btn"
                    onClick={handleCopy}
                    style={{
                      background: copied ? "var(--color-success-bg)" : "var(--color-bg-surface)",
                      border: `1px solid ${copied ? "var(--color-success)" : "var(--color-border)"}`,
                      borderRadius: "var(--radius-md)",
                      padding: "0.6rem 0.875rem",
                      cursor: "pointer",
                      display: "flex", alignItems: "center", gap: "0.4rem",
                      color: copied ? "var(--color-success)" : "var(--color-text-muted)",
                      fontSize: "0.8rem", fontWeight: 600,
                      transition: "all 0.15s",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            </div>

            {/* Done button */}
            <button
              id="credentials-done-btn"
              onClick={handleDone}
              className="btn-primary"
              style={{ width: "100%", fontSize: "0.9rem", padding: "0.8rem" }}
            >
              Done — I&apos;ve copied the password
            </button>
          </div>
        </div>
      )}

      {/* ── Account creation form ──────────────────────────────────────── */}
      <form onSubmit={handleSubmit} id="create-leader-form" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <label style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", fontWeight: 500 }}>
            Full Name
          </label>
          <input
            id="leader-full-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. John Mensah"
            style={inputStyle}
            onFocus={(e) => (e.target.style.borderColor = "var(--color-gold)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <label style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", fontWeight: 500 }}>
            Email Address <span style={{ color: "var(--color-error)" }}>*</span>
          </label>
          <input
            id="leader-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="leader@church.com"
            style={inputStyle}
            onFocus={(e) => (e.target.style.borderColor = "var(--color-gold)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
          />
        </div>

        <div style={{
          background: "var(--color-bg-primary)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "0.65rem 0.875rem",
          fontSize: "0.78rem",
          color: "var(--color-text-muted)",
        }}>
          Branch: <span style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{branchName}</span>
        </div>

        {error && (
          <div style={{
            background: "var(--color-error-bg)", border: "1px solid var(--color-error)",
            borderRadius: "var(--radius-md)", padding: "0.6rem 0.875rem",
            color: "var(--color-error)", fontSize: "0.82rem",
          }}>
            {error}
          </div>
        )}

        <button
          id="create-leader-btn"
          type="submit"
          disabled={loading}
          className="btn-primary"
          style={{ fontSize: "0.875rem", padding: "0.7rem", opacity: loading ? 0.7 : 1 }}
        >
          {loading && <Loader2 size={15} className="animate-spin" />}
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
    </>
  );
}
