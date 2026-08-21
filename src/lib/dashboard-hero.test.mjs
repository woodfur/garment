import assert from "node:assert/strict";
import { test } from "node:test";
import { assignmentImage, collectHeroCandidates, pickHeroLook, serviceLabel } from "./dashboard-hero.ts";

/** Pin the draw so a random pick can still be asserted. */
const always = (value) => () => value;

const look = (dept, gender, { ready = true, url = `https://example.test/${dept}-${gender}.png` } = {}) => ({
  gender,
  department: { name: dept },
  combination: {
    name: `${dept} look`,
    preview_status: ready ? "ready" : "processing",
    male_composite_url: gender === "male" ? url : null,
    female_composite_url: gender === "female" ? url : null,
  },
});

const schedule = (service_date, assignments, id = service_date) => ({
  id, title: "Service", service_date, assignments,
});

test("labels follow the actual service day, not a hardcoded Sunday", () => {
  assert.equal(serviceLabel("2026-08-23"), "This Sunday");
  assert.equal(serviceLabel("2026-08-26"), "This Wednesday");
  assert.equal(serviceLabel("nonsense"), "Next service");
});

test("skips an empty service in favour of the soonest one that is dressed", () => {
  // Services are created ahead in bulk, so the very next one is often still empty.
  const hero = pickHeroLook([
    schedule("2026-08-26", []),
    schedule("2026-08-30", [look("Choir", "female")]),
    schedule("2026-09-06", [look("Ushers", "male")]),
  ]);

  assert.equal(hero.serviceDate, "2026-08-30");
  assert.equal(hero.label, "This Sunday");
});

test("a service whose previews are still rendering counts as empty", () => {
  const hero = pickHeroLook([
    schedule("2026-08-26", [look("Choir", "female", { ready: false })]),
    schedule("2026-08-30", [look("Ushers", "male")]),
  ]);

  assert.equal(hero.serviceDate, "2026-08-30");
  assert.equal(hero.departmentName, "Ushers");
});

test("draws at random across every dressed look, not always the same department", () => {
  const schedules = [
    schedule("2026-08-23", [
      look("Ushers", "male"),
      look("Choir", "male"),
      look("Choir", "female"),
      look("Praise Team", "female"),
    ]),
  ];

  // The pool is ordered department A-Z then Ladies before Men, so a pinned draw is exact.
  assert.equal(pickHeroLook(schedules, always(0)).departmentName, "Choir");
  assert.equal(pickHeroLook(schedules, always(0)).gender, "female");
  assert.equal(pickHeroLook(schedules, always(0.99)).departmentName, "Ushers");

  // Every look in the service must be reachable — nothing is stranded.
  const reached = new Set();
  for (let i = 0; i < 4; i += 1) {
    const hero = pickHeroLook(schedules, always(i / 4));
    reached.add(`${hero.departmentName}/${hero.gender}`);
  }
  assert.deepEqual(
    [...reached].sort(),
    ["Choir/female", "Choir/male", "Praise Team/female", "Ushers/male"]
  );
});

test("a random draw of exactly 1 cannot index past the end", () => {
  const schedules = [schedule("2026-08-23", [look("Choir", "female"), look("Ushers", "male")])];
  const hero = pickHeroLook(schedules, always(1));
  assert.ok(hero, "must still return a look");
  assert.equal(hero.departmentName, "Ushers");
});

test("the caption lists every dressed department regardless of which look was drawn", () => {
  const schedules = [
    schedule("2026-08-23", [look("Ushers", "male"), look("Choir", "female"), look("Choir", "male")]),
  ];
  for (const draw of [0, 0.5, 0.99]) {
    assert.deepEqual(pickHeroLook(schedules, always(draw)).departmentNames, ["Choir", "Ushers"]);
  }
});

test("collectHeroCandidates stays deterministic so it is safe to cache", () => {
  const schedules = [schedule("2026-08-23", [look("Ushers", "male"), look("Choir", "female")])];
  assert.deepEqual(collectHeroCandidates(schedules), collectHeroCandidates(schedules));
});

test("returns null when nothing is dressed, so the plate keeps its placeholder", () => {
  assert.equal(pickHeroLook([]), null);
  assert.equal(pickHeroLook([schedule("2026-08-26", [])]), null);
  assert.equal(pickHeroLook([schedule("2026-08-26", [look("Choir", "female", { ready: false })])]), null);
});

test("an assignment with no rendered image for its gender is not selectable", () => {
  assert.equal(assignmentImage(look("Choir", "female")), "https://example.test/Choir-female.png");
  assert.equal(assignmentImage(look("Choir", "female", { ready: false })), null);
  // Gender missing entirely — nothing to pick a composite column from.
  assert.equal(assignmentImage({ ...look("Choir", "female"), gender: null }), null);
});
