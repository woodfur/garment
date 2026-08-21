import assert from "node:assert/strict";
import { test } from "node:test";
import { assignmentImage, pickHeroLook, serviceLabel } from "./dashboard-hero.ts";

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

test("picks deterministically: department A-Z, then Ladies before Men", () => {
  const hero = pickHeroLook([
    schedule("2026-08-23", [
      look("Ushers", "male"),
      look("Choir", "male"),
      look("Choir", "female"),
      look("Praise Team", "female"),
    ]),
  ]);

  assert.equal(hero.departmentName, "Choir");
  assert.equal(hero.gender, "female");
  // Every dressed department is listed for the caption, deduplicated and sorted.
  assert.deepEqual(hero.departmentNames, ["Choir", "Praise Team", "Ushers"]);
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
