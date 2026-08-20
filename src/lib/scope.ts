import type { Gender } from "@/types/database";

/**
 * Which departments (and, for pieces, which genders) something applies to.
 *
 * Both uniform pieces and looks are shareable across departments: a plain white shirt or
 * a black suit used by nearly every department is expressed either by listing several
 * departments or by setting `all_departments`, which also covers departments created
 * later. For looks this is a cost control — one render is reused rather than rebuilt per
 * department.
 *
 * Department matching is identical for both, so it lives here once. Gender is not shared:
 * a piece carries a `genders` array (both values means unisex) while a look carries a
 * single `gender`, because a look is one outfit on one figure.
 *
 * Single source of truth for the matching rules: the API routes, the uniforms UI, the
 * builder, and the flow-rules spec module all defer to this file so they cannot drift.
 */

export const GENDERS: Gender[] = ["male", "female"];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isGender(value: unknown): value is Gender {
  return value === "male" || value === "female";
}

/** Department scope, shared by uniform pieces and looks. */
export type DepartmentScope = {
  department_ids: string[];
  all_departments: boolean;
};

/** The scope fields as stored on a uniforms row. */
export type PieceScope = DepartmentScope & {
  genders: Gender[];
};

export function matchesDepartment(scope: DepartmentScope, departmentId: string | null): boolean {
  if (!departmentId) return true;
  if (scope.all_departments) return true;
  return scope.department_ids.includes(departmentId);
}

export function pieceMatchesGender(piece: PieceScope, gender: Gender | null): boolean {
  if (!gender) return true;
  return piece.genders.includes(gender);
}

/** True when nothing is scoped to any department, so it will not appear in any builder. */
export function isOrphaned(scope: DepartmentScope): boolean {
  return !scope.all_departments && scope.department_ids.length === 0;
}

/**
 * Validate and normalise the department scope off a request body.
 *
 * Throws with a message safe to show a branch leader. Callers must separately confirm the
 * department ids belong to the caller's branch — that needs a database round trip and is
 * deliberately not done here so this module stays pure.
 */
export function validateDepartmentScope(body: {
  department_ids?: unknown;
  all_departments?: unknown;
}): DepartmentScope {
  const allDepartments = body.all_departments === true;

  const rawDepartments = body.department_ids;
  if (rawDepartments !== undefined && !Array.isArray(rawDepartments)) {
    throw new Error("department_ids must be an array");
  }

  // Deduplicate so a double-click in the UI cannot inflate the stored array.
  const departmentIds = Array.from(new Set((rawDepartments ?? []) as unknown[]));
  if (departmentIds.some((id) => !isUuid(id))) {
    throw new Error("Every department must be a valid id");
  }
  if (!allDepartments && departmentIds.length === 0) {
    throw new Error("Select at least one department, or mark it for all departments");
  }

  return {
    // An all-departments scope keeps any explicit list too, so unticking "all" later
    // falls back to the departments that were chosen rather than to nothing.
    department_ids: departmentIds as string[],
    all_departments: allDepartments,
  };
}

export function validatePieceScope(body: {
  department_ids?: unknown;
  all_departments?: unknown;
  genders?: unknown;
}): PieceScope {
  const departmentScope = validateDepartmentScope(body);

  const rawGenders = body.genders;
  if (rawGenders !== undefined && !Array.isArray(rawGenders)) {
    throw new Error("genders must be an array");
  }

  const genders = Array.from(new Set((rawGenders ?? []) as unknown[]));
  if (genders.some((gender) => !isGender(gender))) {
    throw new Error("Gender must be male or female");
  }
  if (genders.length === 0) {
    throw new Error("Select at least one gender");
  }

  return {
    ...departmentScope,
    genders: GENDERS.filter((gender) => (genders as Gender[]).includes(gender)),
  };
}
