"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Eye, EyeOff, ShieldCheck } from "lucide-react";

function getStrength(password: string): { level: 0 | 1 | 2 | 3; label: string; color: string } {
  if (password.length < 8) return { level: 0, label: "Too short", color: "var(--color-error)" };
  let classes = 0;
  if (/[A-Z]/.test(password)) classes++;
  if (/[a-z]/.test(password)) classes++;
  if (/[0-9]/.test(password)) classes++;
  if (/[^A-Za-z0-9]/.test(password)) classes++;
  if (password.length >= 12 && classes >= 3) return { level: 3, label: "Very strong", color: "var(--color-success)" };
  if (classes >= 2) return { level: 2, label: "Strong", color: "#4CAF50" };
  return { level: 1, label: "Fair", color: "var(--color-gold)" };
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = getStrength(newPassword);
  const passwordsMatch = newPassword === confirm && confirm.length > 0;
  const canSubmit = strength.level >= 1 && passwordsMatch && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);

    const res = await fetch("/api/branch/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "Failed to change password. Please try again.");
      setLoading(false);
      return;
    }

    router.push("/branch/dashboard");
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--color-bg-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    padding: "0.65rem 2.5rem 0.65rem 0.875rem",
    color: "var(--color-text-primary)",
    fontSize: "0.9rem",
    outline: "none",
    width: "100%",
    transition: "border-color 0.15s",
  };

  return (
    <div style={{
      minHeight: "100dvh",
      background: "var(--color-bg-primary)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem",
    }}>
      <div style={{ maxWidth: 420, width: "100%" }}>
        {/* Icon + heading */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div style={{
            width: 64, height: 64,
            background: "linear-gradient(135deg, var(--color-gold) 0%, var(--color-gold-light) 100%)",
            borderRadius: "var(--radius-lg)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 1.25rem",
          }}>
            <ShieldCheck size={28} color="#0D0F14" />
          </div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem", marginBottom: "0.5rem" }}>
            Set Your Password
          </h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.875rem", lineHeight: 1.6 }}>
            You&apos;re logging in for the first time. Please set a new password before continuing.
          </p>
        </div>

        <form onSubmit={handleSubmit} id="change-password-form" className="card" style={{ padding: "1.75rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {/* New password */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <label style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)", fontWeight: 500 }}>
              New Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="new-password"
                type={showNew ? "text" : "password"}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter a strong password"
                style={inputStyle}
                onFocus={(e) => (e.target.style.borderColor = "var(--color-gold)")}
                onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
              />
              <button type="button" onClick={() => setShowNew(v => !v)} style={{
                position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                color: "var(--color-text-muted)", padding: 0,
              }}>
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Strength indicator */}
            {newPassword.length > 0 && (
              <div>
                <div style={{ display: "flex", gap: "4px", marginBottom: "0.3rem" }}>
                  {[1, 2, 3].map((bar) => (
                    <div key={bar} style={{
                      flex: 1, height: 4, borderRadius: 2,
                      background: strength.level >= bar ? strength.color : "var(--color-border)",
                      transition: "background 0.2s",
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: "0.75rem", color: strength.color }}>{strength.label}</span>
              </div>
            )}
          </div>

          {/* Confirm password */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <label style={{ fontSize: "0.82rem", color: "var(--color-text-secondary)", fontWeight: 500 }}>
              Confirm Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter your password"
                style={{
                  ...inputStyle,
                  borderColor: confirm.length > 0 ? (passwordsMatch ? "var(--color-success)" : "var(--color-error)") : undefined,
                }}
              />
              <button type="button" onClick={() => setShowConfirm(v => !v)} style={{
                position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer",
                color: "var(--color-text-muted)", padding: 0,
              }}>
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {confirm.length > 0 && !passwordsMatch && (
              <span style={{ fontSize: "0.75rem", color: "var(--color-error)" }}>Passwords do not match</span>
            )}
          </div>

          {error && (
            <div style={{
              background: "var(--color-error-bg)", border: "1px solid var(--color-error)",
              borderRadius: "var(--radius-md)", padding: "0.65rem 0.875rem",
              color: "var(--color-error)", fontSize: "0.82rem",
            }}>
              {error}
            </div>
          )}

          <button
            id="set-password-btn"
            type="submit"
            disabled={!canSubmit}
            style={{
              background: "linear-gradient(135deg, var(--color-gold) 0%, var(--color-gold-light) 100%)",
              color: "#0D0F14", fontWeight: 700, fontSize: "0.9rem",
              padding: "0.75rem", borderRadius: "var(--radius-md)", border: "none",
              cursor: canSubmit ? "pointer" : "not-allowed",
              opacity: canSubmit ? 1 : 0.5,
              display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
              transition: "opacity 0.15s",
            }}
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "Saving…" : "Set Password & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
