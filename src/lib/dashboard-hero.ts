/**
 * Picks the look shown on the dashboard hero plate.
 *
 * The plate used to be decorative — a hardcoded "This Sunday", a CSS silhouette, and the
 * branch's total look count. It now shows the actual next service's outfit.
 *
 * Pure and free of `@/` imports so the selection rules can be tested directly.
 */

export type HeroAssignment = {
  gender: "male" | "female" | null;
  department: { name: string } | null;
  combination: {
    name: string;
    preview_status: string;
    male_composite_url: string | null;
    female_composite_url: string | null;
  } | null;
};

export type HeroSchedule = {
  id: string;
  title: string;
  service_date: string;
  assignments: HeroAssignment[];
};

export type HeroLook = {
  scheduleId: string;
  serviceDate: string;
  /** "This Sunday", "This Wednesday" — follows the actual service, not a hardcoded day. */
  label: string;
  imageUrl: string;
  departmentName: string;
  gender: "male" | "female";
  /** Every department dressed for that service, for the caption and the numeral. */
  departmentNames: string[];
};

export function assignmentImage(assignment: HeroAssignment): string | null {
  const combo = assignment.combination;
  if (!combo || combo.preview_status !== "ready" || !assignment.gender) return null;
  return assignment.gender === "male" ? combo.male_composite_url : combo.female_composite_url;
}

export function serviceLabel(serviceDate: string): string {
  const date = new Date(`${serviceDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Next service";
  return `This ${new Intl.DateTimeFormat("en-GB", { weekday: "long" }).format(date)}`;
}

/**
 * The soonest service that has something to show, not simply the soonest service.
 *
 * Services are created ahead in bulk, so the very next one is often still empty while a
 * later one is fully dressed. Showing an empty Wednesday while Sunday is ready would make
 * the dashboard look broken. The label names whichever service was chosen, so it stays
 * honest about which day it is.
 */
export function pickHeroLook(schedules: HeroSchedule[]): HeroLook | null {
  const byDate = [...schedules].sort((a, b) => a.service_date.localeCompare(b.service_date));

  for (const schedule of byDate) {
    const ready = (schedule.assignments ?? [])
      .filter((assignment) => assignmentImage(assignment) !== null)
      // Deterministic pick: department A–Z, then Ladies before Men as elsewhere in the app.
      .sort((a, b) => {
        const byDept = (a.department?.name ?? "").localeCompare(b.department?.name ?? "");
        if (byDept !== 0) return byDept;
        return (a.gender === "female" ? 0 : 1) - (b.gender === "female" ? 0 : 1);
      });

    if (ready.length === 0) continue;

    const chosen = ready[0];
    const departmentNames = [...new Set(
      ready.map((assignment) => assignment.department?.name).filter((name): name is string => !!name)
    )].sort((a, b) => a.localeCompare(b));

    return {
      scheduleId: schedule.id,
      serviceDate: schedule.service_date,
      label: serviceLabel(schedule.service_date),
      imageUrl: assignmentImage(chosen)!,
      departmentName: chosen.department?.name ?? chosen.combination!.name,
      gender: chosen.gender!,
      departmentNames,
    };
  }

  return null;
}
