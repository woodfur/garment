import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CREATE_LOOK_MODES,
  filterAssignableCombinations,
  filterPiecesForLook,
  nextRegularServicesThroughEndOfSeptember,
} from "./flow-rules.mjs";

describe("flow rules", () => {
  const piece = (name, overrides) => ({
    name,
    department_ids: [],
    all_departments: false,
    genders: [],
    category: "top",
    is_archived: false,
    ...overrides,
  });

  it("filters pieces by department, gender, category, and archived state", () => {
    const pieces = [
      piece("Male shirt", { department_ids: ["choir"], genders: ["male"] }),
      piece("Female blouse", { department_ids: ["choir"], genders: ["female"] }),
      piece("Male usher shirt", { department_ids: ["ushers"], genders: ["male"] }),
      piece("Archived shirt", { department_ids: ["choir"], genders: ["male"], is_archived: true }),
      piece("Male trousers", { department_ids: ["choir"], genders: ["male"], category: "bottom" }),
    ];

    assert.deepEqual(
      filterPiecesForLook(pieces, {
        departmentId: "choir",
        gender: "male",
        category: "top",
      }).map((p) => p.name),
      ["Male shirt"],
    );
  });

  it("includes pieces shared across several departments and both genders", () => {
    const pieces = [
      piece("White shirt", { department_ids: ["choir", "ushers"], genders: ["male", "female"] }),
      piece("Choir-only robe", { department_ids: ["choir"], genders: ["male"] }),
    ];

    // The shared shirt shows up for every department and gender it lists.
    for (const departmentId of ["choir", "ushers"]) {
      for (const gender of ["male", "female"]) {
        assert.ok(
          filterPiecesForLook(pieces, { departmentId, gender, category: "top" })
            .some((p) => p.name === "White shirt"),
          `White shirt missing for ${departmentId}/${gender}`,
        );
      }
    }

    assert.deepEqual(
      filterPiecesForLook(pieces, { departmentId: "ushers", gender: "female", category: "top" })
        .map((p) => p.name),
      ["White shirt"],
    );
  });

  it("an all-departments piece matches departments it does not list", () => {
    const pieces = [
      piece("Universal white shirt", { all_departments: true, department_ids: [], genders: ["male"] }),
    ];

    // Including a department created after the piece was saved.
    assert.equal(
      filterPiecesForLook(pieces, { departmentId: "brand-new-dept", gender: "male", category: "top" }).length,
      1,
    );
    // Gender is still respected — "all departments" does not mean "all genders".
    assert.equal(
      filterPiecesForLook(pieces, { departmentId: "choir", gender: "female", category: "top" }).length,
      0,
    );
  });

  it("a piece left with no departments matches nothing", () => {
    const pieces = [piece("Orphaned shirt", { department_ids: [], genders: ["male"] })];

    assert.equal(
      filterPiecesForLook(pieces, { departmentId: "choir", gender: "male", category: "top" }).length,
      0,
    );
  });

  it("keeps create look behind one primary mode choice", () => {
    assert.deepEqual(
      CREATE_LOOK_MODES.map((mode) => mode.id),
      ["palette", "pieces"],
    );
  });

  const look = (name, overrides) => ({
    name,
    department_ids: [],
    all_departments: false,
    gender: null,
    ...overrides,
  });

  it("keeps legacy looks assignable after selecting a gender", () => {
    const combinations = [
      look("Legacy choir look", { department_ids: ["choir"], gender: null }),
      look("Male choir look", { department_ids: ["choir"], gender: "male" }),
      look("Female choir look", { department_ids: ["choir"], gender: "female" }),
      look("Male usher look", { department_ids: ["ushers"], gender: "male" }),
    ];

    assert.deepEqual(
      filterAssignableCombinations(combinations, {
        departmentId: "choir",
        gender: "male",
      }).map((combination) => combination.name),
      ["Legacy choir look", "Male choir look"],
    );
  });

  it("a look shared with several departments is assignable to each of them", () => {
    // The reason shared looks exist: one render reused rather than rebuilt per department.
    const combinations = [
      look("Black suit", { department_ids: ["ushers", "choir", "praise"], gender: "male" }),
      look("Usher-only jacket", { department_ids: ["ushers"], gender: "male" }),
    ];

    for (const departmentId of ["ushers", "choir", "praise"]) {
      assert.deepEqual(
        filterAssignableCombinations(combinations, { departmentId, gender: "male" })
          .map((c) => c.name),
        departmentId === "ushers" ? ["Black suit", "Usher-only jacket"] : ["Black suit"],
        `wrong assignable set for ${departmentId}`,
      );
    }
  });

  it("an all-departments look is assignable to a department it does not list", () => {
    const combinations = [look("House style", { all_departments: true, gender: "female" })];

    assert.equal(
      filterAssignableCombinations(combinations, { departmentId: "brand-new", gender: "female" }).length,
      1,
    );
    // Gender still applies — sharing across departments does not share across genders.
    assert.equal(
      filterAssignableCombinations(combinations, { departmentId: "choir", gender: "male" }).length,
      0,
    );
  });

  it("generates regular services through September 30", () => {
    const services = nextRegularServicesThroughEndOfSeptember(new Date("2026-07-13T12:00:00Z"));

    assert.equal(services.at(-1)?.date, "2026-09-30");
    assert.equal(services.at(-1)?.title, "Wednesday Service");
    assert.ok(services.some((service) => service.date === "2026-08-16"));
    assert.ok(services.some((service) => service.date === "2026-09-27"));
  });
});
