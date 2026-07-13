import { createAdminClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth";
import { unstable_cache } from "next/cache";
import { formatDate, truncate } from "@/lib/utils";
import Link from "next/link";
import type { Metadata } from "next";
import PublicScheduleShareButton from "@/components/branch/PublicScheduleShareButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dashboard | Garment" };

type ScheduleRow = {
  id: string;
  title: string;
  service_date: string;
  notes: string | null;
  combinations: { name: string } | null;
};

type LookRow = {
  id: string;
  name: string;
  preview_status: "none" | "processing" | "ready" | "failed";
  male_composite_url: string | null;
  female_composite_url: string | null;
  male_gif_url: string | null;
  female_gif_url: string | null;
  departments: { name: string } | null;
};

export default async function BranchDashboardPage() {
  const auth = await getAuthContext();
  const branchId = auth!.branchId as string;
  const today = new Date().toISOString().split("T")[0];

  // Stat counts — keyed by branchId, 30s TTL
  const statCounts = await unstable_cache(
    async () => {
      const adminClient = createAdminClient();
      const [uniforms, combos, schedCount] = await Promise.all([
        (adminClient as any).from("uniforms").select("*", { count: "exact", head: true })
          .eq("branch_id", branchId).or("is_archived.eq.false,is_archived.is.null"),
        (adminClient as any).from("combinations").select("*", { count: "exact", head: true })
          .eq("branch_id", branchId),
        (adminClient as any).from("schedules").select("*", { count: "exact", head: true })
          .eq("branch_id", branchId).gte("service_date", today),
      ]);
      return {
        uniformsCount: (uniforms.count ?? 0) as number,
        combinationsCount: (combos.count ?? 0) as number,
        scheduleCount: (schedCount.count ?? 0) as number,
      };
    },
    [`dashboard-stats-${branchId}`],
    { tags: [`dashboard-stats-${branchId}`], revalidate: 30 }
  )();

  // Upcoming schedules — keyed by branchId, 30s TTL
  const upcomingSchedules = await unstable_cache(
    async () => {
      const adminClient = createAdminClient();
      const res = await (adminClient as any)
        .from("schedules")
        .select("id, title, service_date, notes, combinations(name)")
        .eq("branch_id", branchId).gte("service_date", today)
        .order("service_date", { ascending: true }).limit(3);
      return (res.data ?? []) as ScheduleRow[];
    },
    [`dashboard-lists-${branchId}`],
    { tags: [`dashboard-lists-${branchId}`], revalidate: 30 }
  )();

  // A few existing looks for quick access / assignment
  const recentLooks = await unstable_cache(
    async () => {
      const adminClient = createAdminClient();
      const res = await (adminClient as any)
        .from("combinations")
        .select("id, name, preview_status, male_composite_url, female_composite_url, male_gif_url, female_gif_url, departments(name)")
        .eq("branch_id", branchId)
        .order("created_at", { ascending: false })
        .limit(6);
      return (res.data ?? []) as LookRow[];
    },
    [`dashboard-looks-${branchId}`],
    { tags: [`dashboard-lists-${branchId}`], revalidate: 30 }
  )();

  const { uniformsCount, combinationsCount, scheduleCount } = statCounts;

  const displayName = auth!.fullName ?? auth!.email;
  const firstName = (displayName ?? "there").split(" ")[0] || "there";
  // gallery rhythm — first plate large, then an asymmetric md/sm cadence
  const galleryClasses = ["g-lg", "g-md", "g-sm", "g-sm", "g-md", "g-md"];

  return (
    <div className="dash">
      {/* masthead */}
      <div className="dash-mast">
        <div>
          <div className="eyebrow eyebrow-accent">The Fitting Room</div>
          <div className="ttl">Dashboard</div>
        </div>
        <div className="issue">
          <b>{combinationsCount} looks · {uniformsCount} pieces</b><br />
          {scheduleCount} upcoming {scheduleCount === 1 ? "service" : "services"}
        </div>
      </div>

      {/* hero spread */}
      <section className="dash-hero">
        <div className="plate">
          <span className="kick">This Sunday</span>
          <div className="silh" />
          <span className="no">{String(combinationsCount).padStart(2, "0")}</span>
        </div>
        <div className="copy">
          <div className="eyebrow">Welcome back, {firstName}</div>
          <h1>Dress the<br /><em>congregation</em>.</h1>
          <p>Compose a look on the mannequin, render it with AI, and publish a lookbook the congregation can browse before the service.</p>
          <div className="dash-cta">
            <Link href="/branch/combinations/new" className="btn-primary">Open the Fitting Room →</Link>
            <Link href="/branch/uniforms" className="btn-secondary">Add a uniform</Link>
            <PublicScheduleShareButton className="btn-secondary" />
          </div>
        </div>
      </section>

      {/* stat ledger */}
      <section className="dash-ledger">
        <div className="c"><div className="v">{uniformsCount}<small>pieces</small></div><div className="k">Wardrobe</div></div>
        <div className="c hl"><div className="v">{String(combinationsCount).padStart(2, "0")}</div><div className="k">Looks composed</div></div>
        <div className="c"><div className="v">{String(scheduleCount).padStart(2, "0")}</div><div className="k">Upcoming services</div></div>
      </section>

      {/* looks gallery */}
      <div className="dash-sec">
        <div className="lt"><span className="num">01</span><h2>This season&rsquo;s <em>looks</em></h2></div>
        <Link href="/branch/uniforms">View all →</Link>
      </div>
      {recentLooks.length === 0 ? (
        <div style={{ padding: "2.5rem 0", color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
          No looks yet. <Link href="/branch/combinations/new" style={{ color: "var(--color-primary-dark)", fontWeight: 600 }}>Compose your first →</Link>
        </div>
      ) : (
        <section className="dash-gallery">
          {recentLooks.map((look, i) => {
            const image = look.male_composite_url ?? look.female_composite_url;
            const gif = look.male_gif_url ?? look.female_gif_url;
            const ready = look.preview_status === "ready" && (image || gif);
            return (
              <Link key={look.id} href={`/branch/combinations/${look.id}`} className={`plate-look ${galleryClasses[i] ?? "g-md"}`}>
                <span className="no">{toRoman(i + 1)}</span>
                {ready && <span className="badge">Ready</span>}
                {ready && image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="pl-media" src={image} alt={look.name} />
                ) : ready && gif ? (
                  <video className="pl-media" src={gif!} autoPlay loop muted playsInline />
                ) : (
                  <div className={`silh${i % 2 === 0 ? " p" : ""}`} />
                )}
                <div className="cap">
                  <div className="t">{look.name}</div>
                  {look.departments?.name && <div className="d">{look.departments.name}</div>}
                </div>
              </Link>
            );
          })}
        </section>
      )}

      {/* footer band */}
      <section className="dash-band">
        <div className="col">
          <div className="dash-sec" style={{ padding: "0 0 0.6rem" }}>
            <div className="lt"><span className="num">02</span><h2>Upcoming <em>services</em></h2></div>
          </div>
          {upcomingSchedules.length === 0 ? (
            <div style={{ padding: "1.5rem 0", color: "var(--color-text-muted)", fontSize: "0.85rem" }}>No upcoming services scheduled.</div>
          ) : (
            upcomingSchedules.map((s, i) => (
              <div key={s.id} className={`dash-svc${i === 0 ? " next" : ""}`}>
                <div className="d">
                  {formatDate(s.service_date, { day: "numeric" })}
                  <small>{formatDate(s.service_date, { month: "short" })}</small>
                </div>
                <div>
                  <div className="t">{s.title}</div>
                  {s.combinations?.name && <div className="c">{s.combinations.name}</div>}
                  {s.notes && <div style={{ fontSize: "0.78rem", color: "var(--color-text-muted)", marginTop: 4 }}>{truncate(s.notes, 90)}</div>}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="col dash-studio">
          <div className="rule-label" style={{ marginBottom: "1.1rem" }}><span>From the studio</span></div>
          <p>Publish a schedule and your congregation can browse this Sunday&rsquo;s looks from a shareable viewer code.</p>
          <div className="links">
            <Link href="/branch/schedule">Publish a schedule <span>→</span></Link>
            <PublicScheduleShareButton className="btn-secondary" label="Copy public link" style={{ justifyContent: "center" }} />
            <Link href="/branch/combinations/new">Compose a look <span>＋</span></Link>
            <Link href="/branch/departments">Manage the roster <span>→</span></Link>
          </div>
        </div>
      </section>
    </div>
  );
}

// roman numerals for the editorial gallery index
function toRoman(n: number): string {
  return ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"][n - 1] ?? String(n);
}
