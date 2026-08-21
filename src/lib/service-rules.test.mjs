import assert from "node:assert/strict";
import { test } from "node:test";
import { departmentServesOn, departmentsForService, isMidweekService } from "./service-rules.ts";

const DEPTS = [
  { id: "d-choir", name: "Choir" },
  { id: "d-ushers", name: "Ushers" },
  { id: "d-praise", name: "Praise Team" },
];

const SUNDAY = "2026-08-23";
const WEDNESDAY = "2026-08-26";

test("only Wednesday counts as midweek", () => {
  assert.equal(isMidweekService(WEDNESDAY), true);
  assert.equal(isMidweekService(SUNDAY), false);
  // A one-off service on another day should not silently drop a department.
  assert.equal(isMidweekService("2026-08-22"), false);
  assert.equal(isMidweekService("nonsense"), false);
});

test("the Choir sits out midweek services but serves on Sundays", () => {
  assert.equal(departmentServesOn("Choir", WEDNESDAY), false);
  assert.equal(departmentServesOn("Choir", SUNDAY), true);
  assert.equal(departmentServesOn("Ushers", WEDNESDAY), true);
  assert.equal(departmentServesOn("Praise Team", WEDNESDAY), true);
});

test("the name match is forgiving about case and stray spacing", () => {
  assert.equal(departmentServesOn("  choir ", WEDNESDAY), false);
  assert.equal(departmentServesOn("CHOIR", WEDNESDAY), false);
});

test("a Wednesday offers Ushers and Praise Team only", () => {
  assert.deepEqual(departmentsForService(DEPTS, WEDNESDAY).map((d) => d.name), ["Ushers", "Praise Team"]);
  assert.deepEqual(departmentsForService(DEPTS, SUNDAY).map((d) => d.name), ["Choir", "Ushers", "Praise Team"]);
});

test("an exempt department still shows when it already has an outfit assigned", () => {
  // The rule governs what can be scheduled; it must never hide existing data.
  assert.deepEqual(
    departmentsForService(DEPTS, WEDNESDAY, ["d-choir"]).map((d) => d.name),
    ["Choir", "Ushers", "Praise Team"]
  );
});
