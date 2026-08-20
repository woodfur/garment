import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isOrphaned,
  matchesDepartment,
  pieceMatchesGender,
  validatePieceScope,
} from "./scope.ts";

const CHOIR = "11111111-1111-4111-8111-111111111111";
const USHERS = "22222222-2222-4222-8222-222222222222";

test("validatePieceScope accepts several departments and both genders", () => {
  const scope = validatePieceScope({
    department_ids: [CHOIR, USHERS],
    genders: ["female", "male"],
  });

  assert.deepEqual(scope.department_ids, [CHOIR, USHERS]);
  assert.equal(scope.all_departments, false);
  // Gender order is normalised so stored rows are comparable.
  assert.deepEqual(scope.genders, ["male", "female"]);
});

test("validatePieceScope allows an empty department list only when all_departments is set", () => {
  const scope = validatePieceScope({ department_ids: [], all_departments: true, genders: ["male"] });
  assert.equal(scope.all_departments, true);
  assert.deepEqual(scope.department_ids, []);

  assert.throws(
    () => validatePieceScope({ department_ids: [], genders: ["male"] }),
    /at least one department/
  );
});

test("validatePieceScope keeps explicit departments alongside all_departments", () => {
  // So that unticking "all" later falls back to the chosen departments, not to nothing.
  const scope = validatePieceScope({
    department_ids: [CHOIR],
    all_departments: true,
    genders: ["male"],
  });

  assert.deepEqual(scope.department_ids, [CHOIR]);
  assert.equal(scope.all_departments, true);
});

test("validatePieceScope deduplicates repeated selections", () => {
  const scope = validatePieceScope({
    department_ids: [CHOIR, CHOIR, USHERS],
    genders: ["male", "male"],
  });

  assert.deepEqual(scope.department_ids, [CHOIR, USHERS]);
  assert.deepEqual(scope.genders, ["male"]);
});

test("validatePieceScope rejects bad input", () => {
  assert.throws(() => validatePieceScope({ department_ids: ["not-a-uuid"], genders: ["male"] }), /valid id/);
  assert.throws(() => validatePieceScope({ department_ids: [CHOIR], genders: [] }), /at least one gender/);
  assert.throws(() => validatePieceScope({ department_ids: [CHOIR], genders: ["other"] }), /male or female/);
  assert.throws(() => validatePieceScope({ department_ids: "choir", genders: ["male"] }), /must be an array/);
});

test("matching honours all_departments and gender membership", () => {
  const shared = { department_ids: [CHOIR], all_departments: false, genders: ["male", "female"] };
  assert.ok(matchesDepartment(shared, CHOIR));
  assert.ok(!matchesDepartment(shared, USHERS));
  assert.ok(pieceMatchesGender(shared, "female"));

  const universal = { department_ids: [], all_departments: true, genders: ["male"] };
  assert.ok(matchesDepartment(universal, USHERS));
  assert.ok(!pieceMatchesGender(universal, "female"));

  // A null filter means "no filter applied".
  assert.ok(matchesDepartment(shared, null));
  assert.ok(pieceMatchesGender(shared, null));
});

test("isOrphaned flags pieces that will not appear in any builder", () => {
  assert.ok(isOrphaned({ department_ids: [], all_departments: false, genders: ["male"] }));
  assert.ok(!isOrphaned({ department_ids: [], all_departments: true, genders: ["male"] }));
  assert.ok(!isOrphaned({ department_ids: [CHOIR], all_departments: false, genders: ["male"] }));
});
