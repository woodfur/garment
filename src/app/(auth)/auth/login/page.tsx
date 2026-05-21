"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Info } from "lucide-react";

// ─── Left decorative panel ────────────────────────────────────────────────────
function LoginLeftPanel() {
  return (
    <div
      aria-hidden="true"
      style={{
        width: "42%",
        minHeight: "100dvh",
        background: "linear-gradient(145deg, #F3F1FF 0%, #EDE9F8 60%, #E4DEFF 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem 2.5rem",
        position: "relative",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      {/* Background circles — decorative depth */}
      <div style={{
        position: "absolute", top: "-80px", right: "-80px",
        width: 280, height: 280,
        borderRadius: "50%",
        background: "rgba(124,92,191,0.08)",
      }} />
      <div style={{
        position: "absolute", bottom: "-60px", left: "-60px",
        width: 220, height: 220,
        borderRadius: "50%",
        background: "rgba(155,135,245,0.10)",
      }} />
      <div style={{
        position: "absolute", top: "40%", right: "-40px",
        width: 140, height: 140,
        borderRadius: "50%",
        background: "rgba(124,92,191,0.06)",
      }} />

      {/* Fabric / clothing SVG illustration */}
      <div style={{ marginBottom: "2.5rem", position: "relative", zIndex: 1 }}>
        <svg width="180" height="180" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Dress / garment silhouette */}
          <ellipse cx="90" cy="88" rx="46" ry="58" fill="rgba(124,92,191,0.12)" />
          <path d="M60 50 Q50 42 38 48 L28 80 Q42 76 52 82 L52 138 Q70 144 90 144 Q110 144 128 138 L128 82 Q138 76 152 80 L142 48 Q130 42 120 50 Q108 36 90 36 Q72 36 60 50Z"
            fill="rgba(124,92,191,0.18)" stroke="rgba(124,92,191,0.5)" strokeWidth="1.5" strokeLinejoin="round" />
          {/* Collar */}
          <path d="M72 50 Q90 58 108 50" stroke="rgba(124,92,191,0.7)" strokeWidth="2" fill="none" strokeLinecap="round" />
          {/* Button line */}
          <line x1="90" y1="60" x2="90" y2="128" stroke="rgba(124,92,191,0.3)" strokeWidth="1" strokeDasharray="4 4" />
          {/* Fabric texture dots */}
          <circle cx="74" cy="90" r="2" fill="rgba(124,92,191,0.25)" />
          <circle cx="84" cy="104" r="2" fill="rgba(124,92,191,0.25)" />
          <circle cx="96" cy="90" r="2" fill="rgba(124,92,191,0.25)" />
          <circle cx="106" cy="104" r="2" fill="rgba(124,92,191,0.25)" />
          <circle cx="80" cy="118" r="2" fill="rgba(124,92,191,0.25)" />
          <circle cx="100" cy="118" r="2" fill="rgba(124,92,191,0.25)" />
          {/* Hanger */}
          <path d="M90 28 L90 36" stroke="rgba(124,92,191,0.6)" strokeWidth="2" strokeLinecap="round" />
          <path d="M76 28 Q90 18 104 28" stroke="rgba(124,92,191,0.6)" strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="90" cy="27" r="3" fill="rgba(124,92,191,0.5)" />
        </svg>
      </div>

      {/* Brand */}
      <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "0.625rem", marginBottom: "0.75rem",
        }}>
          <div style={{
            width: 36, height: 36,
            background: "linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%)",
            borderRadius: "var(--radius-md)",
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 400,
            fontSize: "1.75rem",
            color: "var(--color-primary-dark)",
            letterSpacing: "-0.01em",
          }}>
            Garment
          </span>
        </div>
        <p style={{
          color: "var(--color-text-muted)",
          fontSize: "0.9rem",
          letterSpacing: "0.02em",
        }}>
          Uniform Management, Elevated.
        </p>
      </div>
    </div>
  );
}

// ─── Login form (uses useSearchParams — must stay inside Suspense) ────────────
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      router.push("/");
      router.refresh();
    }
  }

  const inputStyle: React.CSSProperties = {
    background: "#FFFFFF",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    padding: "0.7rem 0.875rem",
    color: "var(--color-text-primary)",
    fontSize: "0.9rem",
    outline: "none",
    transition: "border-color 0.15s, box-shadow 0.15s",
    width: "100%",
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      padding: "3rem 2rem",
    }}>
      <div style={{ width: "100%", maxWidth: 400 }}>

        {/* Heading */}
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{
            fontFamily: "var(--font-heading)",
            fontSize: "2rem",
            fontWeight: 400,
            color: "var(--color-text-primary)",
            marginBottom: "0.4rem",
          }}>
            Welcome back
          </h1>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
            Sign in to your Garment account
          </p>
        </div>

        {/* Reason banner */}
        {reason === "unauthorized" && (
          <div style={{
            display: "flex", alignItems: "center", gap: "0.625rem",
            background: "var(--color-info-bg)",
            border: "1px solid rgba(99,102,241,0.3)",
            borderRadius: "var(--radius-md)",
            padding: "0.75rem 0.875rem",
            marginBottom: "1.25rem",
            fontSize: "0.82rem",
            color: "var(--color-info)",
          }}>
            <Info size={15} style={{ flexShrink: 0 }} />
            You don&apos;t have permission to access that page.
          </div>
        )}

        {/* Form card */}
        <div className="card" style={{ padding: "2rem" }}>
          <form onSubmit={handleLogin} id="login-form" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

            {/* Email */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label htmlFor="email" style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", fontWeight: 500 }}>
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--color-primary-dark)";
                  e.target.style.boxShadow = "0 0 0 3px rgba(155,135,245,0.15)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--color-border)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Password */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label htmlFor="password" style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", fontWeight: 500 }}>
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={inputStyle}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--color-primary-dark)";
                  e.target.style.boxShadow = "0 0 0 3px rgba(155,135,245,0.15)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--color-border)";
                  e.target.style.boxShadow = "none";
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <div style={{
                background: "var(--color-error-bg)",
                border: "1px solid var(--color-error)",
                borderRadius: "var(--radius-md)",
                padding: "0.65rem 0.875rem",
                color: "var(--color-error)",
                fontSize: "0.85rem",
              }}>
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              id="login-submit"
              type="submit"
              disabled={loading}
              style={{
                background: "linear-gradient(135deg, var(--color-primary-dark) 0%, var(--color-primary) 100%)",
                color: "#FFFFFF",
                fontWeight: 600,
                fontSize: "0.9rem",
                padding: "0.8rem",
                borderRadius: "var(--radius-md)",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.65 : 1,
                transition: "opacity 0.15s, transform 0.1s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                width: "100%",
              }}
              onMouseEnter={(e) => !loading && ((e.currentTarget as HTMLButtonElement).style.opacity = "0.9")}
              onMouseLeave={(e) => !loading && ((e.currentTarget as HTMLButtonElement).style.opacity = "1")}
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "0.8rem", color: "var(--color-text-disabled)" }}>
          No account? Contact your administrator.
        </p>
      </div>
    </div>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────
// Split panel: left panel is static (outside Suspense — no hooks), right panel
// wraps LoginForm in Suspense because useSearchParams() suspends during prerender.
export default function LoginPage() {
  return (
    <main style={{ display: "flex", minHeight: "100dvh" }}>
      {/* Left decorative panel — hidden on mobile */}
      <style>{`
        @media (max-width: 768px) {
          .login-left-panel { display: none !important; }
          .login-right-panel { min-height: 100dvh; }
        }
      `}</style>
      <div className="login-left-panel">
        <LoginLeftPanel />
      </div>

      {/* Right form panel */}
      <div
        className="login-right-panel"
        style={{
          flex: 1,
          background: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100dvh",
        }}
      >
        <Suspense fallback={
          <div style={{ textAlign: "center", padding: "4rem", color: "var(--color-text-muted)" }}>
            <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto" }} />
          </div>
        }>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
