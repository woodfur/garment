"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Info } from "lucide-react";
import Image from "next/image";

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

        {/* Church logo */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "2rem" }}>
          <Image
            src="/kharis-church-purple.png"
            alt="Kharis Church"
            width={140}
            height={70}
            style={{ objectFit: "contain" }}
            priority
          />
        </div>

        {/* Heading */}
        <div style={{ marginBottom: "2rem", textAlign: "center" }}>
          <h1 style={{
            fontFamily: "var(--font-heading)",
            fontSize: "1.5rem",
            fontWeight: 700,
            color: "var(--color-text-primary)",
            marginBottom: 0,
          }}>
            Garment
          </h1>
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
export default function LoginPage() {
  return (
    <main style={{
      display: "flex",
      minHeight: "100dvh",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--color-bg-primary)",
    }}>
      <Suspense fallback={
        <div style={{ textAlign: "center", padding: "4rem", color: "var(--color-text-muted)" }}>
          <Loader2 size={24} className="animate-spin" style={{ margin: "0 auto" }} />
        </div>
      }>
        <LoginForm />
      </Suspense>
    </main>
  );
}
