import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/server";

type ZoneItemRow = { combination_id: string; gender: string; zone: string; uniform: { name: string } | null };
type ViewerCombination = {
  id: string;
  name: string;
  preview_status: string;
  male_composite_url: string | null;
  female_composite_url: string | null;
  male_gif_url: string | null;
  female_gif_url: string | null;
  canvas_data: { mode?: string; palette?: Array<{ hex: string }> } | null;
};

type ViewerAssignment = {
  id: string;
  gender: "male" | "female" | null;
  department: { id: string; name: string } | null;
  combination: ViewerCombination | null;
};

interface PageProps {
  params: Promise<{ code: string }>;
  /** ?dept=<id> narrows the page to one department, so a leader can post a link
      straight into that department's group chat. */
  searchParams: Promise<{ dept?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const admin = createAdminClient();
  const { data: branch } = await (admin as any)
    .from("branches")
    .select("name")
    .eq("view_code", code)
    .single();
  return {
    title: branch ? `${branch.name} — Uniform Schedule | Garment` : "Garment",
  };
}

export default async function PublicViewerPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  const { dept: selectedDept } = await searchParams;
  const admin = createAdminClient();

  const { data: branch } = await (admin as any)
    .from("branches")
    .select("id, name")
    .eq("view_code", code)
    .single();

  if (!branch) notFound();

  const today = new Date().toISOString().split("T")[0];
  const { data: schedules } = await (admin as any)
    .from("schedules")
    .select(
      `
      id, service_date, title, notes,
      assignments:schedule_assignments(
        id,
        gender,
        department:departments(id, name),
        combination:combinations(id, name, gender, preview_status, male_composite_url, female_composite_url, male_gif_url, female_gif_url, canvas_data)
      )
    `
    )
    .eq("branch_id", branch.id)
    .gte("service_date", today)
    .order("service_date", { ascending: true });

  // Departments that actually appear in the upcoming schedules, for the filter chips.
  const departments: Array<{ id: string; name: string }> = [];
  for (const schedule of schedules ?? []) {
    for (const assignment of schedule.assignments ?? []) {
      const dept = assignment.department;
      if (dept && !departments.some((d) => d.id === dept.id)) departments.push({ id: dept.id, name: dept.name });
    }
  }
  departments.sort((a, b) => a.name.localeCompare(b.name));

  const activeDept = departments.some((d) => d.id === selectedDept) ? selectedDept : undefined;

  /** Group a service's assignments by department so each gets one heading and one pack. */
  const groupByDepartment = (assignments: ViewerAssignment[]) => {
    const groups: Array<{ id: string; name: string; assignments: ViewerAssignment[] }> = [];
    for (const assignment of assignments ?? []) {
      const dept = assignment.department;
      if (!dept) continue;
      if (activeDept && dept.id !== activeDept) continue;
      let group = groups.find((g) => g.id === dept.id);
      if (!group) { group = { id: dept.id, name: dept.name, assignments: [] }; groups.push(group); }
      group.assignments.push(assignment);
    }
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  };

  // Garment names per look and gender, so the card lists what to wear rather than only
  // naming the look. Palette looks have no garment rows and fall back to their colours.
  const comboIds = [...new Set(
    ((schedules ?? []) as Array<{ assignments?: ViewerAssignment[] }>)
      .flatMap((s) => (s.assignments ?? []).map((a) => a.combination?.id))
      .filter((id): id is string => !!id)
  )];

  const { data: zoneItems } = comboIds.length
    ? await admin
        .from("combination_zone_items")
        .select("combination_id, gender, zone, uniform:uniforms(name)")
        .in("combination_id", comboIds) as { data: ZoneItemRow[] | null }
    : { data: [] as ZoneItemRow[] };

  const piecesFor = (combinationId: string | undefined, gender: string | null): string[] => {
    if (!combinationId || !gender) return [];
    return (zoneItems ?? [])
      .filter((z) => z.combination_id === combinationId && z.gender === gender && z.uniform?.name)
      .map((z) => z.uniform!.name);
  };

  const paletteFor = (combination: ViewerCombination | null | undefined): string[] =>
    combination?.canvas_data?.mode === "palette"
      ? (combination.canvas_data.palette ?? []).map((c) => c.hex)
      : [];

  const figureFor = (a: ViewerAssignment) =>
    a.gender === "male" ? a.combination?.male_composite_url : a.combination?.female_composite_url;

  const ladies = (list: ViewerAssignment[]) => list.find((a) => a.gender === "female");
  const men = (list: ViewerAssignment[]) => list.find((a) => a.gender === "male");

  return (
    <div className="viewer-root">
      <header className="viewer-header">
        <div className="viewer-header-inner">
          <h1 className="viewer-title">{branch.name}</h1>
          <p className="viewer-subtitle">What each department is wearing</p>
        </div>
      </header>

      <main className="viewer-main">
        {departments.length > 1 && (
          <nav className="viewer-dept-filter" aria-label="Filter by department">
            <a href={`/view/${code}`} className={`viewer-dept-chip${activeDept ? "" : " on"}`}>All departments</a>
            {departments.map((d) => (
              <a
                key={d.id}
                href={`/view/${code}?dept=${encodeURIComponent(d.id)}`}
                className={`viewer-dept-chip${activeDept === d.id ? " on" : ""}`}
              >
                {d.name}
              </a>
            ))}
          </nav>
        )}

        {(!schedules || schedules.length === 0) && (
          <div className="viewer-empty">
            <span className="viewer-empty-icon">📅</span>
            <p>No upcoming service dates have been published yet.</p>
          </div>
        )}

        {schedules?.map((schedule: any) => (
          <div key={schedule.id} className="viewer-schedule-card">
            <div className="viewer-schedule-header">
              <div className="viewer-date-badge">
                {new Date(
                  schedule.service_date + "T00:00:00"
                ).toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
              <h2 className="viewer-schedule-title">{schedule.title}</h2>
              {schedule.notes && (
                <p className="viewer-schedule-notes">{schedule.notes}</p>
              )}
              <a
                href={`/api/public/schedules/${schedule.id}/package?code=${encodeURIComponent(code)}`}
                className="viewer-download-btn"
                style={{ display: "inline-flex", marginTop: "0.75rem", textDecoration: "none" }}
              >
                Download package
              </a>
            </div>

            {groupByDepartment(schedule.assignments).length === 0 && (
              <p className="viewer-no-outfits">
                {activeDept ? "No uniform assigned for this department yet." : "No outfits assigned yet."}
              </p>
            )}

            {/* Wide screens: a deck of tall department cards. Both layouts render and CSS
                picks one — switching on viewport in JS would break hydration. */}
            <div className="vw-deck">
              {groupByDepartment(schedule.assignments).map((group) => {
                const f = ladies(group.assignments);
                const m = men(group.assignments);
                const cover = (f && figureFor(f)) || (m && figureFor(m)) || null;
                return (
                  <article key={group.id} className="vw-story">
                    {cover
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img className="vw-story-media" src={cover} alt={`${group.name} outfit`} />
                      : <span className="vw-story-pending">Preview coming soon</span>}
                    <div className="vw-story-body">
                      <h3>{group.name}</h3>
                      <div className="vw-story-cols">
                        {[["Ladies", f], ["Men", m]].map(([label, a]) => {
                          const asg = a as ViewerAssignment | undefined;
                          if (!asg) return null;
                          const pieces = piecesFor(asg.combination?.id, asg.gender);
                          const colours = paletteFor(asg.combination);
                          return (
                            <div key={label as string}>
                              <div className="vw-g">{label as string}</div>
                              {pieces.length > 0 ? (
                                <ul>{pieces.map((n) => <li key={n}>{n}</li>)}</ul>
                              ) : colours.length > 0 ? (
                                <div className="vw-sw">{colours.map((hex) => (
                                  <i key={hex} style={{ background: hex }} title={hex} />))}</div>
                              ) : (
                                <p className="vw-look">{asg.combination?.name}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <a className="vw-dl"
                         href={`/api/public/schedules/${schedule.id}/departments/${group.id}/card?code=${encodeURIComponent(code)}`}>
                        Download {group.name} pack
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* Phones: one answer per department, Ladies and Men side by side. */}
            <div className="vw-answers">
              {groupByDepartment(schedule.assignments).map((group) => {
                const f = ladies(group.assignments);
                const m = men(group.assignments);
                return (
                  <article key={group.id} className="vw-answer">
                    <h3 className="vw-answer-dept">{group.name}</h3>
                    <div className="vw-answer-two">
                      {[["Ladies", f], ["Men", m]].map(([label, a]) => {
                        const asg = a as ViewerAssignment | undefined;
                        const url = asg ? figureFor(asg) : null;
                        const pieces = asg ? piecesFor(asg.combination?.id, asg.gender) : [];
                        const colours = asg ? paletteFor(asg.combination) : [];
                        return (
                          <div className="vw-answer-col" key={label as string}>
                            <div className="vw-g">{label as string}</div>
                            <div className="vw-answer-fig">
                              {url
                                // eslint-disable-next-line @next/next/no-img-element
                                ? <img src={url} alt={`${group.name} ${label as string} outfit`} />
                                : <span className="vw-story-pending">{asg ? "Coming soon" : "Not set"}</span>}
                            </div>
                            {pieces.length > 0 ? (
                              <ul>{pieces.map((n) => <li key={n}>{n}</li>)}</ul>
                            ) : colours.length > 0 ? (
                              <div className="vw-sw">{colours.map((hex) => (
                                <i key={hex} style={{ background: hex }} title={hex} />))}</div>
                            ) : asg ? (
                              <p className="vw-look">{asg.combination?.name}</p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    <a className="vw-dl"
                       href={`/api/public/schedules/${schedule.id}/departments/${group.id}/card?code=${encodeURIComponent(code)}`}>
                      Download {group.name} pack
                    </a>
                  </article>
                );
              })}
            </div>

          </div>
        ))}
      </main>
    </div>
  );
}
