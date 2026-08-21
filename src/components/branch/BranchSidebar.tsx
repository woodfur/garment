"use client";

import Link from "next/link";
import { BRANCH_NAV } from "@/lib/branch-nav";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils";

interface BranchSidebarProps {
  branchName: string;
  leaderName: string | null;
}

// Roman numerals give the rail its editorial, lookbook-index feel.
// The Wardrobe now holds both finished looks and individual pieces.
const navItems: Array<{ href: string; label: string; ix: string }> = [
  // Labels come from BRANCH_NAV so desktop and mobile cannot drift; the roman
  // numerals are a desktop-only flourish.
  ...BRANCH_NAV.map((item, index) => ({ ...item, ix: ["i", "ii", "iii", "iv"][index] })),
];

export default function BranchSidebar({ branchName, leaderName }: BranchSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const displayName = leaderName ?? "Branch Leader";

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();   // clear client router cache — prevents stale RSC exposure
  }

  return (
    <aside
      className="branch-sidebar"
      style={{
        width: 228,
        background: "var(--color-bg-surface)",
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        gap: "2.25rem",
        padding: "1.875rem 1.375rem",
        flexShrink: 0,
      }}
    >
      {/* Brand */}
      <Link
        href="/branch/dashboard"
        style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "0.7rem", color: "inherit" }}
      >
        <div
          style={{
            width: 34, height: 34, flexShrink: 0,
            background: "var(--color-primary-dark)",
            borderRadius: "9px",
            display: "grid", placeItems: "center",
            color: "#fff", fontFamily: "var(--font-heading)", fontSize: "1.125rem",
            boxShadow: "0 8px 18px -8px rgba(71,39,67,0.6)",
          }}
        >
          G
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 400, fontSize: "1.3rem", letterSpacing: "-0.01em", lineHeight: 1 }}>
            Garment
          </div>
          <div style={{ fontSize: "0.53rem", letterSpacing: "0.3em", textTransform: "uppercase", color: "var(--color-text-faint)", marginTop: 3 }}>
            Atelier · Lookbook
          </div>
        </div>
      </Link>

      {/* Nav */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ fontSize: "0.56rem", letterSpacing: "0.24em", textTransform: "uppercase", color: "var(--color-text-faint)", fontWeight: 700, margin: "0 0 0.75rem 0.625rem" }}>
          Studio
        </div>
        {navItems.map(({ href, label, ix }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              prefetch={true}
              id={`branch-nav-${label.toLowerCase().replace(/\s+/g, "-")}`}
              className={`rail-link${active ? " on" : ""}`}
            >
              <span className="ix">{ix}</span>
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer: identity + sign out */}
      <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "1.1rem", display: "flex", flexDirection: "column", gap: "0.875rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <div
            style={{
              width: 32, height: 32, flexShrink: 0, borderRadius: "50%",
              background: "var(--color-primary-light)", display: "grid", placeItems: "center",
              fontFamily: "var(--font-heading)", color: "var(--color-primary-dark)", fontSize: "0.875rem",
            }}
          >
            {getInitials(displayName)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.78rem", fontWeight: 600, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {displayName}
            </div>
            <div style={{ fontSize: "0.66rem", color: "var(--color-text-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {branchName} · Lead
            </div>
          </div>
        </div>
        <button
          id="branch-signout"
          onClick={handleSignOut}
          className="rail-link"
          style={{ background: "transparent", border: "1px solid transparent", cursor: "pointer", width: "100%", font: "inherit", fontSize: "0.82rem" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-error)"; (e.currentTarget as HTMLButtonElement).style.background = "var(--color-error-bg)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = ""; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <LogOut size={16} style={{ width: 15 }} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
