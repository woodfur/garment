"use client";

import { getInitials } from "@/lib/utils";
import type { Profile } from "@/types/database";

interface AdminTopbarProps {
  profile: Profile | null;
}

export default function AdminTopbar({ profile }: AdminTopbarProps) {
  return (
    <header style={{
      height: 64,
      background: "var(--color-bg-surface)",
      borderBottom: "1px solid var(--color-border)",
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      padding: "0 2rem",
      gap: "1rem",
      flexShrink: 0,
    }}>
      {/* User badge */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <div style={{
          width: 36, height: 36,
          background: "linear-gradient(135deg, var(--color-gold) 0%, var(--color-gold-light) 100%)",
          borderRadius: "var(--radius-full)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: "0.8rem",
          color: "#0D0F14",
          flexShrink: 0,
        }}>
          {getInitials(profile?.full_name || profile?.email || "A")}
        </div>
        <div>
          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-primary)" }}>
            {profile?.full_name || "Admin"}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--color-text-disabled)" }}>
            {profile?.email}
          </div>
        </div>
      </div>
    </header>
  );
}
