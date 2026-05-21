import { createAdminClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";
import { formatDate, truncate } from "@/lib/utils";
import {
  Shirt, Layers, Calendar, Package, Megaphone, AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard | Garment" };

type ScheduleRow = {
  id: string;
  title: string;
  service_date: string;
  notes: string | null;
  combinations: { name: string } | null;
};

type AnnouncementRow = {
  id: string;
  title: string;
  body: string | null;
  created_at: string;
};

type InventoryRow = {
  quantity: number | null;
  reorder_level: number | null;
};

const quickActions = [
  { href: "/branch/uniforms",      label: "Uniforms",      icon: Shirt,      desc: "Manage uniform items and images" },
  { href: "/branch/combinations",  label: "Combinations",  icon: Layers,     desc: "Build and save uniform combinations" },
  { href: "/branch/schedule",      label: "Schedule",      icon: Calendar,   desc: "Plan uniform combinations by service date" },
  { href: "/branch/inventory",     label: "Inventory",     icon: Package,    desc: "Track uniform stock levels" },
  { href: "/branch/announcements", label: "Announcements", icon: Megaphone,  desc: "Post announcements for your branch" },
];

export default async function BranchDashboardPage() {
  const auth = await getAuthContext();
  // Layout already redirected if auth is null or branchId is null
  const branchId = auth!.branchId as string;
  const today = new Date().toISOString().split("T")[0];
  const adminClient = createAdminClient();

  // Parallel fetch all dashboard data
  const [
    uniformsRes,
    combinationsRes,
    scheduleCountRes,
    upcomingRes,
    announcementsRes,
    inventoryRes,
  ] = await Promise.all([
    // Active uniforms (handle nullable is_archived)
    (adminClient as any).from("uniforms")
      .select("*", { count: "exact", head: true })
      .eq("branch_id", branchId)
      .or("is_archived.eq.false,is_archived.is.null") as Promise<{ count: number | null }>,
    // All combinations
    (adminClient as any).from("combinations")
      .select("*", { count: "exact", head: true })
      .eq("branch_id", branchId) as Promise<{ count: number | null }>,
    // Upcoming services count
    (adminClient as any).from("schedules")
      .select("*", { count: "exact", head: true })
      .eq("branch_id", branchId)
      .gte("service_date", today) as Promise<{ count: number | null }>,
    // Next 3 upcoming services with combination name
    (adminClient as any).from("schedules")
      .select("id, title, service_date, notes, combinations(name)")
      .eq("branch_id", branchId)
      .gte("service_date", today)
      .order("service_date", { ascending: true })
      .limit(3) as Promise<{ data: ScheduleRow[] | null }>,
    // Latest 3 published announcements
    (adminClient as any).from("announcements")
      .select("id, title, body, created_at")
      .eq("branch_id", branchId)
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(3) as Promise<{ data: AnnouncementRow[] | null }>,
    // Inventory for JS-side low stock filter
    (adminClient as any).from("inventory_items")
      .select("quantity, reorder_level")
      .eq("branch_id", branchId) as Promise<{ data: InventoryRow[] | null }>,
  ]);

  // Low stock: PostgREST can't compare two columns — filter in JavaScript
  const lowStockCount = inventoryRes.data?.filter(
    (item) => item.reorder_level !== null && item.quantity !== null
      && item.quantity <= item.reorder_level
  ).length ?? 0;

  const stats = [
    {
      label: "Uniforms",
      value: uniformsRes.count ?? 0,
      icon: Shirt,
      color: "var(--color-gold)",
      bg: "rgba(201,168,76,0.12)",
    },
    {
      label: "Combinations",
      value: combinationsRes.count ?? 0,
      icon: Layers,
      color: "var(--color-info)",
      bg: "rgba(33,150,243,0.12)",
    },
    {
      label: "Upcoming Services",
      value: scheduleCountRes.count ?? 0,
      icon: Calendar,
      color: "#A78BFA",
      bg: "rgba(167,139,250,0.12)",
    },
    {
      label: "Low Stock Alerts",
      value: lowStockCount,
      icon: AlertTriangle,
      color: lowStockCount > 0 ? "var(--color-error)" : "var(--color-success)",
      bg: lowStockCount > 0 ? "var(--color-error-bg)" : "var(--color-success-bg)",
    },
  ];

  const upcomingSchedules = (upcomingRes.data ?? []) as ScheduleRow[];
  const announcements = (announcementsRes.data ?? []) as AnnouncementRow[];
  const displayName = auth!.fullName ?? auth!.email;

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.75rem", marginBottom: "0.25rem" }}>
          Welcome back, {displayName.split(" ")[0]} 👋
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
          Here&apos;s what&apos;s happening at your branch today.
        </p>
      </div>

      {/* ── Stat Cards ─────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "1.25rem",
        marginBottom: "2rem",
      }}>
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card" style={{ padding: "1.5rem", display: "flex", alignItems: "center", gap: "1.25rem" }}>
            <div style={{
              width: 48, height: 48,
              borderRadius: "var(--radius-md)",
              background: bg,
              border: `1px solid ${color}30`,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <Icon size={22} color={color} />
            </div>
            <div>
              <div style={{ fontSize: "1.75rem", fontWeight: 700, fontFamily: "var(--font-heading)", lineHeight: 1 }}>
                {value}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", marginTop: "0.25rem" }}>
                {label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Upcoming Schedule + Announcements ──────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: "1.5rem",
        marginBottom: "2rem",
      }}>
        {/* Upcoming Schedule */}
        <div className="card" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.25rem" }}>
            <Calendar size={17} color="var(--color-gold)" />
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "0.95rem", fontWeight: 600 }}>
              Upcoming Schedule
            </h2>
          </div>

          {upcomingSchedules.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem 1rem", color: "var(--color-text-disabled)" }}>
              <Calendar size={32} style={{ marginBottom: "0.75rem", opacity: 0.4 }} />
              <p style={{ fontSize: "0.85rem" }}>No upcoming services scheduled.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {upcomingSchedules.map((sched, i) => (
                <div
                  key={sched.id}
                  style={{
                    padding: "0.875rem 1rem",
                    background: "var(--color-bg-primary)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    borderLeft: i === 0 ? "3px solid var(--color-gold)" : "3px solid var(--color-border)",
                  }}
                >
                  <div style={{ fontSize: "0.72rem", color: "var(--color-text-disabled)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem" }}>
                    {formatDate(sched.service_date, { weekday: "short", day: "numeric", month: "short" })}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.2rem" }}>
                    {sched.title}
                  </div>
                  {sched.combinations?.name && (
                    <div style={{ fontSize: "0.78rem", color: "var(--color-gold)" }}>
                      {sched.combinations.name}
                    </div>
                  )}
                  {sched.notes && (
                    <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", marginTop: "0.2rem" }}>
                      {truncate(sched.notes, 80)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Announcements */}
        <div className="card" style={{ padding: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.25rem" }}>
            <Megaphone size={17} color="var(--color-gold)" />
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "0.95rem", fontWeight: 600 }}>
              Recent Announcements
            </h2>
          </div>

          {announcements.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem 1rem", color: "var(--color-text-disabled)" }}>
              <Megaphone size={32} style={{ marginBottom: "0.75rem", opacity: 0.4 }} />
              <p style={{ fontSize: "0.85rem" }}>No announcements yet.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {announcements.map((ann) => (
                <div
                  key={ann.id}
                  style={{
                    padding: "0.875rem 1rem",
                    background: "var(--color-bg-primary)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.3rem" }}>
                    {ann.title}
                  </div>
                  {ann.body && (
                    <div style={{ fontSize: "0.8rem", color: "var(--color-text-muted)", lineHeight: 1.5, marginBottom: "0.4rem" }}>
                      {truncate(ann.body, 100)}
                    </div>
                  )}
                  <div style={{ fontSize: "0.72rem", color: "var(--color-text-disabled)" }}>
                    {formatDate(ann.created_at, { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Actions ───────────────────────────────────────── */}
      <div className="card" style={{ padding: "1.5rem" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "0.95rem", fontWeight: 600, marginBottom: "1.25rem" }}>
          Quick Actions
        </h2>
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
                background: "rgba(201,168,76,0.1)",
                border: "1px solid rgba(201,168,76,0.25)",
                color: "var(--color-gold)",
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
                background: "rgba(201,168,76,0.08)",
                border: "1px solid rgba(201,168,76,0.15)",
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
      </div>
    </div>
  );
}
