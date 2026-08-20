import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildShareCardFilename,
  columnGeometry,
  formatServiceDate,
  orderColumns,
  renderShareCard,
  shareCardHeight,
  truncateForColumn,
} from "./share-card.ts";

const column = (gender, labels = []) => ({
  gender,
  image: null,
  lookName: "Look",
  items: labels.map((label) => (typeof label === "string" ? { label } : label)),
});

test("Ladies reads before Men, matching how the posts are laid out", () => {
  assert.deepEqual(orderColumns([column("male"), column("female")]).map((c) => c.gender), ["female", "male"]);
  assert.deepEqual(orderColumns([column("female"), column("male")]).map((c) => c.gender), ["female", "male"]);
});

test("a single column fills the card; two sit side by side without overflowing", () => {
  const [only] = columnGeometry(1);
  assert.equal(only.x, 48);
  assert.equal(only.x + only.width, 1152);

  const [left, right] = columnGeometry(2);
  assert.equal(left.x, 48);
  assert.ok(right.x >= left.x + left.width, "columns must not overlap");
  assert.ok(right.x + right.width <= 1152, "columns must stay inside the margin");
});

test("the card grows to fit the longest garment list", () => {
  const short = shareCardHeight([column("female", ["Blouse"])]);
  const long = shareCardHeight([column("female", ["Blouse"]), column("male", ["Shirt", "Jacket", "Trousers", "Shoes"])]);
  assert.ok(long > short, "a longer list must not be clipped");
});

test("service dates render in full and never slip a day", () => {
  assert.equal(formatServiceDate("2026-08-23"), "Sunday, 23 August 2026");
  // Date-only strings are parsed at local midnight, so the day never slips backwards.
  assert.equal(formatServiceDate("2026-01-01"), "Thursday, 1 January 2026");
  assert.equal(formatServiceDate("not-a-date"), "not-a-date");
});

test("filenames are safe and name the department and date", () => {
  assert.equal(buildShareCardFilename({ departmentName: "Praise Team", serviceDate: "2026-08-23" }), "praise-team-2026-08-23.png");
  assert.equal(buildShareCardFilename({ departmentName: "Ushers / Greeters", serviceDate: "2026-08-23" }), "ushers-greeters-2026-08-23.png");
  assert.equal(buildShareCardFilename({ departmentName: "   ", serviceDate: "2026-08-23" }), "uniform-2026-08-23.png");
});

test("long garment names are trimmed rather than running off the column", () => {
  const short = truncateForColumn("White shirt", 500);
  assert.equal(short, "White shirt");

  const long = truncateForColumn("Irish linen top and matching knee length skirt with broach", 300);
  assert.ok(long.length < 60);
  assert.ok(long.endsWith("…"));
});

test("the image band collapses when no figure has rendered", async () => {
  const withoutImages = shareCardHeight([column("female", ["Blouse"])]);
  const withImage = shareCardHeight([{ ...column("female", ["Blouse"]), image: Buffer.from([1]) }]);
  assert.ok(withImage > withoutImages + 500, "a rendered card reserves the full figure band");
  assert.ok(withoutImages < 500, "an unrendered card must not be mostly blank space");
});

test("colour items carry a hex so the card can draw a swatch", async () => {
  const png = await renderShareCard({
    branchName: "Kharis Church Freetown",
    departmentName: "Choir",
    serviceTitle: "Wednesday Service",
    serviceDate: "2026-07-15",
    columns: [column("female", [{ label: "pearl grey", hex: "#E6D7C3" }, { label: "chocolate brown", hex: "#704832" }])],
  });
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
});

test("renders a PNG even when a preview is not ready", async () => {
  const png = await renderShareCard({
    branchName: "Kharis Church Freetown",
    departmentName: "Ushers",
    serviceTitle: "Sunday Service",
    serviceDate: "2026-08-23",
    columns: [column("female", ["Irish linen top", "White broach", "Heels"]), column("male", ["Black suit"])],
  });

  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.ok(png.length > 0);
});

test("rejects a card with no genders to show", async () => {
  await assert.rejects(
    () => renderShareCard({
      branchName: "B", departmentName: "D", serviceTitle: "S", serviceDate: "2026-08-23", columns: [],
    }),
    /at least one gender/
  );
});
