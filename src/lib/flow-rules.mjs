// Scoping rules live in scope.ts so the API routes, the UI, and this spec module cannot
// drift apart. Explicit .ts extension — node cannot map .js onto .ts.
import { matchesDepartment, pieceMatchesGender } from "./scope.ts";

export const GENDERS = ["male", "female"];

export const CREATE_LOOK_MODES = [
  { id: "palette", label: "Use colour palette" },
  { id: "pieces", label: "Use uploaded pieces" },
];

export function isGender(value) {
  return GENDERS.includes(value);
}

export function normalizeGender(value) {
  return isGender(value) ? value : null;
}

export function filterPiecesForLook(pieces, { departmentId, gender, category }) {
  return pieces.filter((piece) => {
    if (piece.is_archived) return false;
    if (!matchesDepartment(piece, departmentId ?? null)) return false;
    if (!pieceMatchesGender(piece, gender ?? null)) return false;
    if (category && piece.category !== category) return false;
    return true;
  });
}

export function filterAssignableCombinations(combinations, { departmentId, gender }) {
  return combinations.filter((combination) => {
    // A look shared with this department is assignable to it — that is the whole point of
    // shared looks: one render, reused instead of rebuilt per department.
    if (!matchesDepartment(combination, departmentId ?? null)) return false;
    if (!gender) return false;
    return combination.gender === gender || combination.gender == null;
  });
}

function localDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * How far ahead regular services are materialised. A rolling window rather than the
 * whole calendar: every date this returns is auto-created as a real schedule row and
 * gets a line in the coverage grid, so filling 2029 up front would mean ~345 rows and
 * ~345 writes on one page load. The window rolls forward as time passes, so the
 * schedule never runs dry; anything further out is a one-off special service.
 */
export const SERVICE_HORIZON_DAYS = 90;

/** Hard stop for the regular Sunday/Wednesday calendar. */
export const SERVICE_CALENDAR_END_YEAR = 2029;

export function upcomingRegularServices(fromDate = new Date()) {
  const out = [];
  const today = new Date(fromDate);
  today.setHours(0, 0, 0, 0);

  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + SERVICE_HORIZON_DAYS);
  const calendarEnd = new Date(SERVICE_CALENDAR_END_YEAR, 11, 31);
  const end = horizon < calendarEnd ? horizon : calendarEnd;
  if (today > end) return out;

  for (const d = new Date(today); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day === 0 || day === 3) {
      out.push({
        date: localDateStr(d),
        title: day === 0 ? "Sunday Service" : "Wednesday Service",
      });
    }
  }

  return out;
}
