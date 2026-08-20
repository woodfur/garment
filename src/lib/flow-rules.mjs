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

export function nextRegularServicesThroughEndOfSeptember(fromDate = new Date()) {
  const out = [];
  const today = new Date(fromDate);
  today.setHours(0, 0, 0, 0);

  const end = new Date(today.getFullYear(), 8, 30);
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
