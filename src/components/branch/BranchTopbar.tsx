"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils";

interface BranchTopbarProps {
  branchName: string;
  leaderName: string | null;
  email: string;
}

export default function BranchTopbar({ branchName, leaderName, email }: BranchTopbarProps) {
  const router = useRouter();
  const displayName = leaderName ?? email;
  const initials = getInitials(displayName);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();   // clear client router cache
  }

  return (
    <header
      className="branch-topbar"
      style={{
        height: 62,
        background: "var(--color-bg-surface)",
        borderBottom: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 2rem",
        flexShrink: 0,
      }}
    >
      {/* Left: masthead — eyebrow + branch name in serif */}
      <div>
        <div className="eyebrow eyebrow-accent">Uniform Studio</div>
        <div style={{ fontFamily: "var(--font-heading)", fontStyle: "italic", fontWeight: 400, fontSize: "1.05rem", lineHeight: 1.1, marginTop: 1 }}>
          {branchName}
        </div>
      </div>

      {/* Right: identity + sign out */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div
            style={{
              width: 34, height: 34, borderRadius: "50%",
              background: "var(--color-primary-light)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: "0.8rem", color: "var(--color-primary-dark)",
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <span style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", fontWeight: 500 }}>
            {displayName}
          </span>
        </div>

        <div style={{ width: 1, height: 20, background: "var(--color-border)" }} />

        <button
          id="branch-topbar-signout"
          onClick={handleSignOut}
          title="Sign out"
          style={{
            display: "flex", alignItems: "center", gap: "0.4rem",
            background: "transparent", border: "none",
            color: "var(--color-text-muted)", fontSize: "0.8rem",
            cursor: "pointer", padding: "0.4rem 0.5rem",
            borderRadius: "var(--radius-md)", transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-error)";
            (e.currentTarget as HTMLButtonElement).style.background = "var(--color-error-bg)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)";
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </header>
  );
}
