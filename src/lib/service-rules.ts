/**
 * Which departments wear uniforms at which services.
 *
 * Midweek services are smaller: only the Ushers and Praise Team are in uniform, so the
 * Choir should not be offered a Wednesday slot or counted as an unfilled one.
 *
 * The rule is keyed on department NAME because there is no column for it yet. That is the
 * one fragile part — renaming the department in the app breaks the match — so it lives
 * here alone rather than being spread through the UI. Moving it to a per-department
 * setting later means changing this file and nothing else.
 */

/** Departments that sit out midweek services, lower-cased for a forgiving match. */
const MIDWEEK_EXEMPT = ["choir"];

/** True for a Wednesday service. Keyed on the day itself, so a one-off Saturday service
 *  still includes everyone. */
export function isMidweekService(serviceDate: string): boolean {
  const date = new Date(`${serviceDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  return date.getDay() === 3;
}

export function departmentServesOn(departmentName: string, serviceDate: string): boolean {
  if (!isMidweekService(serviceDate)) return true;
  return !MIDWEEK_EXEMPT.includes(departmentName.trim().toLowerCase());
}

/**
 * The departments to offer for a service.
 *
 * An exempt department is still included when it already has an outfit assigned — the
 * rule governs what can be scheduled, and should never make existing data disappear.
 */
export function departmentsForService<T extends { id: string; name: string }>(
  departments: T[],
  serviceDate: string,
  alreadyAssignedIds: ReadonlyArray<string> = []
): T[] {
  return departments.filter(
    (department) =>
      departmentServesOn(department.name, serviceDate) || alreadyAssignedIds.includes(department.id)
  );
}
