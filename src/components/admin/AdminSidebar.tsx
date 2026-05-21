"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2, LogOut, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const navItems = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/branches", label: "Branches", icon: Building2 },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();   // clear client router cache
  }

  return (
    <aside style={{
      width: 240,
      background: "var(--color-bg-surface)",
      borderRight: "1px solid var(--color-border)",
      display: "flex",
      flexDirection: "column",
      padding: "1.5rem 0",
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: "0 1.5rem 2rem" }}>
        <Link href="/admin/dashboard" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <div style={{
            width: 32, height: 32,
            background: "linear-gradient(135deg, var(--color-gold) 0%, var(--color-gold-light) 100%)",
            borderRadius: "var(--radius-md)",
            flexShrink: 0,
          }} />
          <span className="text-gold-gradient" style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "1.25rem" }}>
            Garment
          </span>
        </Link>
        <div style={{
          marginTop: "0.5rem",
          fontSize: "0.7rem",
          color: "var(--color-text-disabled)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          paddingLeft: "0.25rem",
        }}>
          Super Admin
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.25rem", padding: "0 0.75rem" }}>
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              prefetch={true}
              id={`admin-nav-${label.toLowerCase()}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.625rem 0.875rem",
                borderRadius: "var(--radius-md)",
                textDecoration: "none",
                fontSize: "0.875rem",
                fontWeight: active ? 600 : 400,
                color: active ? "var(--color-primary-dark)" : "var(--color-text-muted)",
                background: active ? "var(--color-primary-light)" : "transparent",
                border: active ? "1px solid rgba(155,135,245,0.25)" : "1px solid transparent",
                transition: "all 0.15s",
              }}
            >
              <Icon size={17} />
              {label}
              {active && <ChevronRight size={14} style={{ marginLeft: "auto" }} />}
            </Link>
          );
        })}
      </nav>

      {/* Sign out */}
      <div style={{ padding: "0 0.75rem", borderTop: "1px solid var(--color-border)", paddingTop: "1rem", marginTop: "1rem" }}>
        <button
          id="admin-signout"
          onClick={handleSignOut}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.625rem 0.875rem",
            borderRadius: "var(--radius-md)",
            background: "transparent",
            border: "1px solid transparent",
            color: "var(--color-text-muted)",
            fontSize: "0.875rem",
            cursor: "pointer",
            width: "100%",
            transition: "all 0.15s",
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
          <LogOut size={17} />
          Sign out
        </button>
      </div>
    </aside>
  );
}
