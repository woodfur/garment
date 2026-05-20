"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
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
      // Redirect to root — it handles role-based routing server-side
      router.push("/");
      router.refresh();
    }
  }

  return (
    <div className="w-full max-w-md">
      {/* Logo */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 mb-4">
          <div style={{
            width: 36, height: 36,
            background: "linear-gradient(135deg, var(--color-gold) 0%, var(--color-gold-light) 100%)",
            borderRadius: "var(--radius-md)"
          }} />
          <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "1.5rem" }}
            className="text-gold-gradient">
            Polar
          </span>
        </div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.75rem" }}
          className="font-semibold mb-1">
          Welcome back
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
          Sign in to your Polar account
        </p>
      </div>

      {/* Card */}
      <div className="card p-8">
        <form onSubmit={handleLogin} id="login-form" className="flex flex-col gap-5">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
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
              style={{
                background: "var(--color-bg-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "0.65rem 0.875rem",
                color: "var(--color-text-primary)",
                fontSize: "0.9rem",
                outline: "none",
                transition: "border-color 0.15s",
                width: "100%",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--color-gold)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
            />
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
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
              style={{
                background: "var(--color-bg-surface)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "0.65rem 0.875rem",
                color: "var(--color-text-primary)",
                fontSize: "0.9rem",
                outline: "none",
                transition: "border-color 0.15s",
                width: "100%",
              }}
              onFocus={(e) => (e.target.style.borderColor = "var(--color-gold)")}
              onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
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
              background: loading
                ? "var(--color-gold-muted)"
                : "linear-gradient(135deg, var(--color-gold) 0%, var(--color-gold-light) 100%)",
              color: "#0D0F14",
              fontWeight: 600,
              fontSize: "0.9rem",
              padding: "0.75rem",
              borderRadius: "var(--radius-md)",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              transition: "opacity 0.15s, transform 0.1s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
            }}
            onMouseEnter={(e) => !loading && ((e.target as HTMLButtonElement).style.opacity = "0.9")}
            onMouseLeave={(e) => ((e.target as HTMLButtonElement).style.opacity = "1")}
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
  );
}
