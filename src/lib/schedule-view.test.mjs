import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assignmentsByDepartment,
  coverageRows,
  coverageSummary,
  pickFeatured,
  relativeDayLabel,
  serviceDayLabel,
  serviceDayShort,
} from "./schedule-view.ts";

const DEPTS = [
  { id: "d-choir", name: "Choir" },
  { id: "d-ushers", name: "Ushers" },
  { id: "d-praise", name: "Praise Team" },
];

const a = (deptId, name, gender, look = "A look") => ({
  id: `${deptId}-${gender}`,
  department_id: deptId,
  gender,
  department: { id: deptId, name },
  combination: { id: "c1", name: look, preview_status: "ready" },
});

const group = (id, service_date, assignments = []) => ({ id, service_date, title: "Sunday Service", assignments });

test("dates render in full and short form without slipping a day", () => {
  assert.equal(serviceDayLabel("2026-08-23"), "Sunday 23 August");
  assert.equal(serviceDayShort("2026-08-23"), "Sun 23 Aug");
  assert.equal(serviceDayLabel("nope"), "nope");
});

test("relative labels read naturally near the service", () => {
  assert.equal(relativeDayLabel("2026-08-21", "2026-08-21"), "Today");
  assert.equal(relativeDayLabel("2026-08-22", "2026-08-21"), "Tomorrow");
  assert.equal(relativeDayLabel("2026-08-23", "2026-08-21"), "In 2 days");
  assert.equal(relativeDayLabel("2026-08-20", "2026-08-21"), "Past");
});

test("the featured service is the soonest one with outfits, not just the soonest", () => {
  // Services are created ahead in bulk, so the next one is usually still empty.
  const groups = [group("g1", "2026-08-26"), group("g2", "2026-08-30", [a("d-choir", "Choir", "female")])];
  assert.equal(pickFeatured(groups).id, "g2");

  // With nothing dressed anywhere, fall back to the soonest so the page is not blank.
  assert.equal(pickFeatured([group("g1", "2026-08-26")]).id, "g1");
  assert.equal(pickFeatured([]), null);
});

test("a cell is full only when both figures are dressed", () => {
  const rows = coverageRows([
    group("g1", "2026-08-23", [
      a("d-choir", "Choir", "female"),
      a("d-choir", "Choir", "male"),
      a("d-ushers", "Ushers", "male"),
    ]),
  ], DEPTS);

  const [choir, ushers, praise] = rows[0].cells;
  assert.equal(choir.state, "full");
  // One gender dressed still leaves the other with nothing — worth showing differently.
  assert.equal(ushers.state, "partial");
  assert.equal(praise.state, "empty");
  assert.equal(rows[0].filled, 2);
});

test("a cell lists each look once even when both genders share it", () => {
  const rows = coverageRows([
    group("g1", "2026-08-23", [
      a("d-choir", "Choir", "female", "Blush pink palette"),
      a("d-choir", "Choir", "male", "Blush pink palette"),
    ]),
  ], DEPTS);

  assert.deepEqual(rows[0].cells[0].lookNames, ["Blush pink palette"]);
  assert.deepEqual(rows[0].cells[0].genders.sort(), ["female", "male"]);
});

test("the summary counts dressed slots and wholly empty services", () => {
  const rows = coverageRows([
    group("g1", "2026-08-23", [a("d-choir", "Choir", "female"), a("d-choir", "Choir", "male")]),
    group("g2", "2026-08-26"),
    group("g3", "2026-08-30"),
  ], DEPTS);

  assert.deepEqual(coverageSummary(rows), { filled: 1, total: 9, emptyServices: 2 });
});

test("the featured card groups a service's assignments by department, A-Z", () => {
  const grouped = assignmentsByDepartment(group("g1", "2026-08-23", [
    a("d-ushers", "Ushers", "male"),
    a("d-choir", "Choir", "female"),
    a("d-choir", "Choir", "male"),
  ]));

  assert.deepEqual(grouped.map((g) => g.name), ["Choir", "Ushers"]);
  assert.equal(grouped[0].assignments.length, 2);
});
