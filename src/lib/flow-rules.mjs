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
    if (departmentId && piece.department_id !== departmentId) return false;
    if (gender && piece.gender !== gender) return false;
    if (category && piece.category !== category) return false;
    return true;
  });
}

export function filterAssignableCombinations(combinations, { departmentId, gender }) {
  return combinations.filter((combination) => {
    if (departmentId && combination.department_id !== departmentId) return false;
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
