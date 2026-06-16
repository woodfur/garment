"use client";

/**
 * MobileTabBar — atelier bottom navigation for the mobile redesign.
 * Shown only ≤768px (see `.at-mobile-tabbar` in globals.css); desktop keeps the rail.
 * The raised centre FAB is the app's hero action: compose a new look.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, Shirt, Calendar, Users, Plus } from "lucide-react";

const TABS = [
  { href: "/branch/dashboard", label: "Studio", icon: LayoutGrid },
  { href: "/branch/uniforms", label: "Wardrobe", icon: Shirt },
  { href: "/branch/departments", label: "Roster", icon: Users },
  { href: "/branch/schedule", label: "Schedule", icon: Calendar },
];

export default function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="at-mobile-tabbar"
      style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
        display: "none", // flipped to flex ≤768px by globals.css
        alignItems: "center", justifyContent: "space-around",
        padding: "0.6rem 0.5rem calc(0.7rem + env(safe-area-inset-bottom))",
        background: "rgba(251,249,244,0.88)", backdropFilter: "blur(14px)",
        borderTop: "1px solid var(--color-border)",
        fontFamily: "var(--font-ui)",
      }}
    >
      {TABS.slice(0, 2).map(({ href, label, icon: Icon }) => (
        <Tab key={href} href={href} label={label} Icon={Icon} pathname={pathname} />
      ))}

      {/* Centre FAB — Compose */}
      <Link
        href="/branch/combinations/new"
        aria-label="Compose a new look"
        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, textDecoration: "none", color: "var(--color-primary-dark)" }}
      >
        <span
          style={{
            width: 46, height: 46, marginTop: -22, borderRadius: "50%",
            background: "var(--color-primary-dark)", color: "#fff",
            display: "grid", placeItems: "center",
            boxShadow: "0 10px 22px -8px rgba(71,39,67,0.7)",
          }}
        >
          <Plus size={22} />
        </span>
        <span style={{ fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.03em" }}>Compose</span>
      </Link>

      {TABS.slice(2).map(({ href, label, icon: Icon }) => (
        <Tab key={href} href={href} label={label} Icon={Icon} pathname={pathname} />
      ))}
    </nav>
  );
}

function Tab({ href, label, Icon, pathname }: { href: string; label: string; Icon: React.ElementType; pathname: string }) {
  const on = pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        textDecoration: "none", fontSize: "0.6rem", fontWeight: 600, letterSpacing: "0.03em",
        color: on ? "var(--color-primary-dark)" : "var(--color-text-faint)",
      }}
    >
      <Icon size={20} />
      {label}
    </Link>
  );
}
