import assert from "node:assert/strict";
import { test } from "node:test";
import { BRANCH_NAV, branchNavItem, isNavActive } from "./branch-nav.ts";

test("every branch route has exactly one label", () => {
  const hrefs = BRANCH_NAV.map((item) => item.href);
  const labels = BRANCH_NAV.map((item) => item.label);

  assert.equal(new Set(hrefs).size, hrefs.length, "a route is listed twice");
  assert.equal(new Set(labels).size, labels.length, "two routes share a label");
});

test("the labels the navs previously disagreed on are pinned", () => {
  // Desktop said "The Studio" / "Departments"; mobile said "Studio" / "Roster".
  assert.equal(branchNavItem("/branch/dashboard").label, "Studio");
  assert.equal(branchNavItem("/branch/departments").label, "Departments");
  assert.equal(branchNavItem("/branch/uniforms").label, "Wardrobe");
  assert.equal(branchNavItem("/branch/schedule").label, "Schedule");
});

test("an unknown route fails loudly rather than rendering a blank tab", () => {
  assert.throws(() => branchNavItem("/branch/nope"), /No branch nav item/);
});

test("a nav entry is active for its own route and anything beneath it", () => {
  assert.ok(isNavActive("/branch/uniforms", "/branch/uniforms"));
  assert.ok(isNavActive("/branch/uniforms", "/branch/uniforms/123"));
  assert.ok(!isNavActive("/branch/uniforms", "/branch/uniforms-archive"));
  assert.ok(!isNavActive("/branch/uniforms", "/branch/schedule"));
});
