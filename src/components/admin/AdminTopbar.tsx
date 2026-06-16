"use client";

import { getInitials } from "@/lib/utils";
import type { Profile } from "@/types/database";

interface AdminTopbarProps {
  profile: Profile | null;
}

export default function AdminTopbar({ profile }: AdminTopbarProps) {
  return (
    <header style={{
      height: 62,
      background: "var(--color-bg-surface)",
      borderBottom: "1px solid var(--color-border)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 2rem",
      gap: "1rem",
      flexShrink: 0,
    }}>
      <div>
        <div className="eyebrow eyebrow-accent">Administration</div>
        <div style={{ fontFamily: "var(--font-heading)", fontStyle: "italic", fontWeight: 400, fontSize: "1.05rem", lineHeight: 1.1, marginTop: 1 }}>
          All branches
        </div>
      </div>

      {/* User badge */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
        <div style={{
          width: 34, height: 34,
          background: "var(--color-primary-light)",
          borderRadius: "var(--radius-full)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-heading)", fontWeight: 500, fontSize: "0.8rem",
          color: "var(--color-primary-dark)", flexShrink: 0,
        }}>
          {getInitials(profile?.full_name || profile?.email || "A")}
        </div>
        <div>
          <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text-primary)" }}>
            {profile?.full_name || "Admin"}
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--color-text-faint)" }}>
            {profile?.email}
          </div>
        </div>
      </div>
    </header>
  );
}
