"use client";

import { useState } from "react";
import { Loader2, CheckCircle } from "lucide-react";

interface InviteLeaderFormProps {
  branchId: string;
  branchName: string;
}

export default function InviteLeaderForm({ branchId, branchName }: InviteLeaderFormProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, fullName, branchId }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to send invitation");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setEmail("");
    setFullName("");
    setLoading(false);
  }

  const inputStyle = {
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

  if (success) {
    return (
      <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
        <CheckCircle size={40} color="var(--color-success)" style={{ margin: "0 auto 0.75rem" }} />
        <p style={{ fontWeight: 600, marginBottom: "0.35rem" }}>Invitation sent!</p>
        <p style={{ fontSize: "0.82rem", color: "var(--color-text-muted)", marginBottom: "1.25rem" }}>
          The invite email has been delivered. The leader has 48 hours to accept.
        </p>
        <button
          onClick={() => setSuccess(false)}
          style={{
            background: "transparent",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            padding: "0.5rem 1rem",
            color: "var(--color-text-muted)",
            fontSize: "0.82rem",
            cursor: "pointer",
          }}
        >
          Invite another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} id="invite-leader-form" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        <label style={{ fontSize: "0.8rem", color: "var(--color-text-secondary)", fontWeight: 500 }}>
          Full Name
        </label>
        <input
          id="invite-full-name"
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
          id="invite-email"
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
        id="send-invite-btn"
        type="submit"
        disabled={loading}
        style={{
          background: "linear-gradient(135deg, var(--color-gold) 0%, var(--color-gold-light) 100%)",
          color: "#0D0F14", fontWeight: 600, fontSize: "0.875rem",
          padding: "0.65rem", borderRadius: "var(--radius-md)", border: "none",
          cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1,
          display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
        }}
      >
        {loading && <Loader2 size={15} className="animate-spin" />}
        {loading ? "Sending…" : "Send Invitation"}
      </button>
    </form>
  );
}
