import assert from "node:assert/strict";
import { test } from "node:test";
import { ZONE_POSITIONS, zoneLabel } from "../types/zones.ts";

test("the full-body zone reads as Suit on the male figure and Dress on the female one", () => {
  assert.equal(zoneLabel("full_body", "male"), "Suit");
  assert.equal(zoneLabel("full_body", "female"), "Dress");
  // No figure chosen yet — fall back to the stored label rather than guessing.
  assert.equal(zoneLabel("full_body", null), "Dress");
});

test("every other zone label is the same on both figures", () => {
  for (const zone of Object.keys(ZONE_POSITIONS)) {
    if (zone === "full_body") continue;
    assert.equal(
      zoneLabel(zone, "male"),
      zoneLabel(zone, "female"),
      `${zone} should not differ by gender`
    );
    assert.equal(zoneLabel(zone, "male"), ZONE_POSITIONS[zone].label);
  }
});
