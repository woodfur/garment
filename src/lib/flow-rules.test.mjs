import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CREATE_LOOK_MODES,
  filterAssignableCombinations,
  filterPiecesForLook,
  nextRegularServicesThroughEndOfSeptember,
} from "./flow-rules.mjs";

describe("flow rules", () => {
  it("filters pieces by department, gender, category, and archived state", () => {
    const pieces = [
      { name: "Male shirt", department_id: "choir", gender: "male", category: "top", is_archived: false },
      { name: "Female blouse", department_id: "choir", gender: "female", category: "top", is_archived: false },
      { name: "Male usher shirt", department_id: "ushers", gender: "male", category: "top", is_archived: false },
      { name: "Archived shirt", department_id: "choir", gender: "male", category: "top", is_archived: true },
      { name: "Male trousers", department_id: "choir", gender: "male", category: "bottom", is_archived: false },
    ];

    assert.deepEqual(
      filterPiecesForLook(pieces, {
        departmentId: "choir",
        gender: "male",
        category: "top",
      }).map((piece) => piece.name),
      ["Male shirt"],
    );
  });

  it("keeps create look behind one primary mode choice", () => {
    assert.deepEqual(
      CREATE_LOOK_MODES.map((mode) => mode.id),
      ["palette", "pieces"],
    );
  });

  it("keeps legacy looks assignable after selecting a gender", () => {
    const combinations = [
      { name: "Legacy choir look", department_id: "choir", gender: null },
      { name: "Male choir look", department_id: "choir", gender: "male" },
      { name: "Female choir look", department_id: "choir", gender: "female" },
      { name: "Male usher look", department_id: "ushers", gender: "male" },
    ];

    assert.deepEqual(
      filterAssignableCombinations(combinations, {
        departmentId: "choir",
        gender: "male",
      }).map((combination) => combination.name),
      ["Legacy choir look", "Male choir look"],
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
