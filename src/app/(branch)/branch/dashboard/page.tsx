import { createAdminClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";
import { unstable_cache } from "next/cache";
import { formatDate, truncate } from "@/lib/utils";
import { Shirt, Layers, Calendar, Megaphone, AlertTriangle } from "lucide-react";
import QuickActionsGrid from "@/components/branch/QuickActionsGrid";
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

export default async function BranchDashboardPage() {
  const auth = await getAuthContext();
  const branchId = auth!.branchId as string;
  const today = new Date().toISOString().split("T")[0];
  // GAP-6 FIX: Do NOT create adminClient here — move it inside each cache callback.
  // If captured in closure, a stale client instance would be used by cache hits from
  // other requests. Each callback creates its own client on execution.

  /**
   * Two server-side cache entries — keyed by branchId, 30s TTL each.
   *
   * force-dynamic controls PAGE rendering cache (always re-renders RSC).
   * unstable_cache controls DATA cache — persists across page renders.
   * These are independent layers: page renders fresh, data comes from cache.
   *
   * Cache invalidation: future mutation API routes (uniforms, schedules, etc.)
   * must call: revalidateTag(`dashboard-stats-${branchId}`)
   *            revalidateTag(`dashboard-lists-${branchId}`)
   */

  // Entry 1: Stat counts (uniforms, combinations, schedules, low stock)
  const statCounts = await unstable_cache(
    async () => {
      const adminClient = createAdminClient(); // GAP-6 FIX: created inside callback — not captured from outer scope
      const [uniforms, combos, schedCount, lowStockRes] = await Promise.all([
        (adminClient as any)
          .from("uniforms")
          .select("*", { count: "exact", head: true })
          .eq("branch_id", branchId)
          .or("is_archived.eq.false,is_archived.is.null"),
        (adminClient as any)
          .from("combinations")
          .select("*", { count: "exact", head: true })
          .eq("branch_id", branchId),
        (adminClient as any)
          .from("schedules")
          .select("*", { count: "exact", head: true })
          .eq("branch_id", branchId)
          .gte("service_date", today),
        // DB-side count via RPC — avoids fetching all rows just to filter in JS
        (adminClient as any)
          .rpc("get_branch_low_stock_count", { p_branch_id: branchId }),
      ]);

      const lowStockCount = (lowStockRes.data ?? 0) as number;

      return {
        uniformsCount: (uniforms.count ?? 0) as number,
        combinationsCount: (combos.count ?? 0) as number,
        scheduleCount: (schedCount.count ?? 0) as number,
        lowStockCount,
      };
    },
    [`dashboard-stats-${branchId}`],
    // GAP-1 FIX: tags must be in the options object for revalidateTag() to work.
    // Without tags here, all revalidateTag('dashboard-stats-*') calls were no-ops.
    { tags: [`dashboard-stats-${branchId}`], revalidate: 30 }
  )();

  // Entry 2: List data (upcoming schedules, announcements)
  const listData = await unstable_cache(
    async () => {
      const adminClient = createAdminClient(); // GAP-6 FIX: created inside callback
      const [upcomingRes, announcementsRes] = await Promise.all([
        (adminClient as any)
          .from("schedules")
          .select("id, title, service_date, notes, combinations(name)")
          .eq("branch_id", branchId)
          .gte("service_date", today)
          .order("service_date", { ascending: true })
          .limit(3),
        (adminClient as any)
          .from("announcements")
          .select("id, title, body, created_at")
          .eq("branch_id", branchId)
          .eq("is_published", true)
          .order("created_at", { ascending: false })
          .limit(3),
      ]);
      return {
        upcomingSchedules: (upcomingRes.data ?? []) as ScheduleRow[],
        announcements: (announcementsRes.data ?? []) as AnnouncementRow[],
      };
    },
    [`dashboard-lists-${branchId}`],
    // GAP-1 FIX: tags must be in the options object for revalidateTag() to work.
    // Without tags here, all revalidateTag('dashboard-lists-*') calls were no-ops.
    { tags: [`dashboard-lists-${branchId}`], revalidate: 30 }
  )();

  const { uniformsCount, combinationsCount, scheduleCount, lowStockCount } = statCounts;
  const { upcomingSchedules, announcements } = listData;

  const stats = [
    {
      label: "Uniforms",
      value: uniformsCount,
      icon: Shirt,
      color: "var(--color-gold)",
      bg: "rgba(155,135,245,0.12)",
    },
    {
      label: "Combinations",
      value: combinationsCount,
      icon: Layers,
      color: "var(--color-info)",
      bg: "rgba(33,150,243,0.12)",
    },
    {
      label: "Upcoming Services",
      value: scheduleCount,
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

  const displayName = auth!.fullName ?? auth!.email;

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.75rem", marginBottom: "0.25rem" }}>
          Welcome back, {displayName.split(" ")[0] || "there"} 👋
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
          <QuickActionsGrid />
        </div>
      </div>
    </div>
  );
}
