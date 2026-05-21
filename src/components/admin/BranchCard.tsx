"use client";

import Link from "next/link";
import { Building2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
import type { Branch } from "@/types/database";
import { useState } from "react";

export default function BranchCard({ branch }: { branch: Branch }) {
  const [hovered, setHovered] = useState(false);

  return (
    <Link href={`/admin/branches/${branch.id}`} style={{ textDecoration: "none" }}>
      <div
        className="card"
        style={{
          padding: "1.5rem",
          cursor: "pointer",
          transition: "border-color 0.15s, transform 0.15s",
          borderColor: hovered ? "var(--color-gold)" : undefined,
          transform: hovered ? "translateY(-2px)" : "translateY(0)",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Icon + Name */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
          <div style={{
            width: 44, height: 44,
            background: "linear-gradient(135deg, var(--color-gold) 0%, var(--color-gold-light) 100%)",
            borderRadius: "var(--radius-md)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Building2 size={20} color="#FFFFFF" />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{branch.name}</div>
            <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)" }}>/{branch.slug}</div>
          </div>
        </div>

        {/* View Code */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "var(--color-bg-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "0.625rem 0.875rem",
        }}>
          <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>View Code</span>
          <span style={{
            fontWeight: 700, fontSize: "0.875rem",
            color: "var(--color-gold)", letterSpacing: "0.06em",
          }}>
            {branch.view_code}
          </span>
        </div>

        <div style={{ marginTop: "0.875rem", fontSize: "0.75rem", color: "var(--color-text-disabled)" }}>
          Created {formatDate(branch.created_at)}
        </div>
      </div>
    </Link>
  );
}
