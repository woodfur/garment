/**
 * Derivations for the schedule page.
 *
 * The page shows two different layouts: a featured "next service" on wide screens and a
 * coverage grid on phones. Both need the same facts about the data, so they are worked
 * out here once, kept pure, and tested — rather than inline in a component that is
 * already over a thousand lines.
 */

export type ScheduleViewAssignment = {
  id: string;
  department_id: string;
  gender: "male" | "female" | null;
  department: { id: string; name: string } | null;
  combination: {
    id: string; name: string; preview_status: string;
    male_composite_url?: string | null; female_composite_url?: string | null;
    male_gif_url?: string | null; female_gif_url?: string | null;
  } | null;
};

export type ScheduleViewGroup = {
  id: string;
  service_date: string;
  title: string;
  assignments: ScheduleViewAssignment[];
};

export type ViewDepartment = { id: string; name: string };

/** "Sunday 23 August" — the full form, for headings. */
export function serviceDayLabel(serviceDate: string): string {
  const date = new Date(`${serviceDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return serviceDate;
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

/** "Sun 23 Aug" — the compact form, for grid rows and strips. */
export function serviceDayShort(serviceDate: string): string {
  const date = new Date(`${serviceDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return serviceDate;
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(date);
}

/** How many days away a service is, so the hero can say "in 2 days". */
export function daysUntil(serviceDate: string, today: string): number | null {
  const a = new Date(`${serviceDate}T00:00:00`).getTime();
  const b = new Date(`${today}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

export function relativeDayLabel(serviceDate: string, today: string): string {
  const days = daysUntil(serviceDate, today);
  if (days === null) return "";
  if (days < 0) return "Past";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

/**
 * The service to feature. Prefers the soonest one that has outfits assigned — a hero for
 * an empty service is just a placeholder, and services are created ahead in bulk so the
 * very next one is often still empty.
 */
export function pickFeatured<T extends ScheduleViewGroup>(groups: T[]): T | null {
  if (groups.length === 0) return null;
  return groups.find((group) => group.assignments.length > 0) ?? groups[0];
}

export type CoverageCell = {
  departmentId: string;
  departmentName: string;
  /** Look names assigned to this department for this service, deduplicated. */
  lookNames: string[];
  genders: Array<"male" | "female">;
  /** A rendered figure per gender. Both are shown — one render alone hides the other half
   *  of a department's uniform, which is exactly what people need to check. */
  figures: { female: string | null; male: string | null };
  state: "full" | "partial" | "empty";
};

/** The rendered still for an assignment, preferring the composite over the legacy GIF. */
export function assignmentFigure(assignment: ScheduleViewAssignment): string | null {
  const combo = assignment.combination;
  if (!combo || !assignment.gender) return null;
  return assignment.gender === "male"
    ? combo.male_composite_url ?? combo.male_gif_url ?? null
    : combo.female_composite_url ?? combo.female_gif_url ?? null;
}

export type CoverageRow = {
  scheduleId: string;
  serviceDate: string;
  title: string;
  cells: CoverageCell[];
  filled: number;
};

/**
 * A row per service, a cell per department.
 *
 * "full" means both figures are dressed, "partial" means one — worth distinguishing,
 * because a department with only a men's outfit still leaves the women with nothing.
 */
export function coverageRows(
  groups: ReadonlyArray<ScheduleViewGroup>,
  departments: ReadonlyArray<ViewDepartment>
): CoverageRow[] {
  return groups.map((group) => {
    const cells = departments.map((department) => {
      const forDept = group.assignments.filter((a) => a.department_id === department.id);
      const genders = [...new Set(forDept.map((a) => a.gender).filter((g): g is "male" | "female" => !!g))];
      const lookNames = [...new Set(forDept.map((a) => a.combination?.name).filter((n): n is string => !!n))];

      return {
        departmentId: department.id,
        departmentName: department.name,
        lookNames,
        genders,
        figures: {
          female: forDept.filter((a) => a.gender === "female").map(assignmentFigure).find(Boolean) ?? null,
          male: forDept.filter((a) => a.gender === "male").map(assignmentFigure).find(Boolean) ?? null,
        },
        state: (genders.length >= 2 ? "full" : genders.length === 1 ? "partial" : "empty") as CoverageCell["state"],
      };
    });

    return {
      scheduleId: group.id,
      serviceDate: group.service_date,
      title: group.title,
      cells,
      filled: cells.filter((cell) => cell.state !== "empty").length,
    };
  });
}

/** Headline numbers for the coverage grid: how many department slots are dressed. */
export function coverageSummary(rows: CoverageRow[]): { filled: number; total: number; emptyServices: number } {
  const total = rows.reduce((sum, row) => sum + row.cells.length, 0);
  const filled = rows.reduce((sum, row) => sum + row.filled, 0);
  return { filled, total, emptyServices: rows.filter((row) => row.filled === 0).length };
}

/** Group a service's assignments by department, for the featured card row. */
export function assignmentsByDepartment<T extends ScheduleViewAssignment>(
  group: { assignments: T[] }
): Array<{ id: string; name: string; assignments: T[] }> {
  const out: Array<{ id: string; name: string; assignments: T[] }> = [];
  for (const assignment of group.assignments) {
    const name = assignment.department?.name;
    if (!name) continue;
    let entry = out.find((candidate) => candidate.id === assignment.department_id);
    if (!entry) {
      entry = { id: assignment.department_id, name, assignments: [] };
      out.push(entry);
    }
    entry.assignments.push(assignment);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
