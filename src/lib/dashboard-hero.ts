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

/** Everything dressed for the chosen service — the pool a hero look is drawn from. */
export type HeroCandidates = {
  scheduleId: string;
  serviceDate: string;
  label: string;
  /** Every dressed department, deduplicated and sorted, for the caption and the numeral. */
  departmentNames: string[];
  /** Sorted department A–Z then Ladies before Men, so a given random draw is reproducible. */
  looks: Array<{ imageUrl: string; departmentName: string; gender: "male" | "female" }>;
};

/**
 * Collect what could be shown for the next service worth showing.
 *
 * Deliberately the soonest service that has rendered looks, not simply the soonest
 * service: services are created ahead in bulk, so the very next one is usually still
 * empty while a later one is fully dressed, and a hero plate for an empty service is
 * just the placeholder again. The label names whichever service was chosen, so it stays
 * honest about which day it is.
 *
 * Pure and deterministic — the random draw happens in pickHeroLook.
 */
export function collectHeroCandidates(schedules: HeroSchedule[]): HeroCandidates | null {
  const byDate = [...schedules].sort((a, b) => a.service_date.localeCompare(b.service_date));

  for (const schedule of byDate) {
    const ready = (schedule.assignments ?? [])
      .filter((assignment) => assignmentImage(assignment) !== null)
      .sort((a, b) => {
        const byDept = (a.department?.name ?? "").localeCompare(b.department?.name ?? "");
        if (byDept !== 0) return byDept;
        return (a.gender === "female" ? 0 : 1) - (b.gender === "female" ? 0 : 1);
      });

    if (ready.length === 0) continue;

    return {
      scheduleId: schedule.id,
      serviceDate: schedule.service_date,
      label: serviceLabel(schedule.service_date),
      departmentNames: [...new Set(
        ready.map((assignment) => assignment.department?.name).filter((name): name is string => !!name)
      )].sort((a, b) => a.localeCompare(b)),
      looks: ready.map((assignment) => ({
        imageUrl: assignmentImage(assignment)!,
        departmentName: assignment.department?.name ?? assignment.combination!.name,
        gender: assignment.gender!,
      })),
    };
  }

  return null;
}

/**
 * Draw one look at random from the next dressed service.
 *
 * Random rather than fixed so the dashboard shows a different department each visit
 * instead of always the alphabetically-first one. `random` is injectable purely so the
 * draw can be pinned in tests; callers pass nothing.
 *
 * Called outside the page's cache so it re-rolls per request — caching the draw itself
 * would freeze one department for the whole cache window.
 */
export function pickHeroLook(
  schedules: HeroSchedule[],
  random: () => number = Math.random
): HeroLook | null {
  const candidates = collectHeroCandidates(schedules);
  if (!candidates) return null;
  return heroLookFrom(candidates, random);
}

export function heroLookFrom(
  candidates: HeroCandidates,
  random: () => number = Math.random
): HeroLook {
  // Clamped so a random() of exactly 1 (or anything out of range) cannot index past the end.
  const index = Math.min(candidates.looks.length - 1, Math.max(0, Math.floor(random() * candidates.looks.length)));
  const chosen = candidates.looks[index];

  return {
    scheduleId: candidates.scheduleId,
    serviceDate: candidates.serviceDate,
    label: candidates.label,
    imageUrl: chosen.imageUrl,
    departmentName: chosen.departmentName,
    gender: chosen.gender,
    departmentNames: candidates.departmentNames,
  };
}
