"use client";

import Link from "next/link";
import { Shirt, Layers, Calendar, Package, Megaphone } from "lucide-react";

const quickActions = [
  { href: "/branch/uniforms",      label: "Uniforms",      icon: Shirt,      desc: "Manage uniform items and images" },
  { href: "/branch/combinations",  label: "Combinations",  icon: Layers,     desc: "Build and save uniform combinations" },
  { href: "/branch/schedule",      label: "Schedule",      icon: Calendar,   desc: "Plan uniform combinations by service date" },
  { href: "/branch/inventory",     label: "Inventory",     icon: Package,    desc: "Track uniform stock levels" },
  { href: "/branch/announcements", label: "Announcements", icon: Megaphone,  desc: "Post announcements for your branch" },
];

export default function QuickActionsGrid() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
      {quickActions.map(({ href, label, icon: Icon, desc }) => (
        <Link
          key={href}
          href={href}
          id={`quick-action-${label.toLowerCase()}`}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            padding: "1.25rem",
            background: "var(--color-bg-primary)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            textDecoration: "none",
            minWidth: 180,
            flex: "1 1 180px",
            maxWidth: 240,
            transition: "border-color 0.15s, transform 0.1s",
            position: "relative",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--color-gold)";
            (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.borderColor = "var(--color-border)";
            (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(0)";
          }}
        >
          {/* Coming Soon badge */}
          <span style={{
            position: "absolute", top: "0.75rem", right: "0.75rem",
            background: "rgba(155,135,245,0.1)",
            border: "1px solid rgba(155,135,245,0.25)",
            color: "var(--color-primary-dark)",
            fontSize: "0.62rem", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.06em",
            padding: "0.15rem 0.4rem",
            borderRadius: "var(--radius-full)",
          }}>
            Soon
          </span>
          <div style={{
            width: 40, height: 40,
            borderRadius: "var(--radius-md)",
            background: "rgba(155,135,245,0.08)",
            border: "1px solid rgba(155,135,245,0.15)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icon size={18} color="var(--color-gold)" />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--color-text-primary)", marginBottom: "0.25rem" }}>
              {label}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", lineHeight: 1.4 }}>
              {desc}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
