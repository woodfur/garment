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
  }

  return (
    <header style={{
      height: 60,
      background: "var(--color-bg-surface)",
      borderBottom: "1px solid var(--color-border)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 1.75rem",
      flexShrink: 0,
    }}>
      {/* Left: branch name + role */}
      <div>
        <div style={{ fontWeight: 700, fontSize: "0.9rem", fontFamily: "var(--font-heading)" }}>
          {branchName}
        </div>
        <div style={{ fontSize: "0.7rem", color: "var(--color-text-disabled)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Branch Leader
        </div>
      </div>

      {/* Right: avatar + name + sign out */}
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        {/* Avatar + name */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <div style={{
            width: 34, height: 34,
            borderRadius: "50%",
            background: "linear-gradient(135deg, var(--color-gold) 0%, var(--color-gold-light) 100%)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 700, fontSize: "0.75rem", color: "#0D0F14",
            flexShrink: 0,
          }}>
            {initials}
          </div>
          <span style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", fontWeight: 500 }}>
            {displayName}
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: "var(--color-border)" }} />

        {/* Sign out */}
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
