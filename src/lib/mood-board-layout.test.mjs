import assert from "node:assert/strict";
import { test } from "node:test";
import { SWATCH_WIDTH, moodBoardLayout } from "./mood-board-layout.ts";

test("the board widens to fit both figures without anything overlapping", () => {
  const one = moodBoardLayout(1);
  const two = moodBoardLayout(2);

  assert.ok(two.width > one.width, "two figures need a wider board");
  assert.equal(two.figureLefts.length, 2);
  assert.ok(two.figureLefts[1] >= two.figureLefts[0] + two.figureWidth, "figures must not overlap");
  assert.ok(two.swatchLeft >= two.figureLefts[1] + two.figureWidth, "figures must not run under the swatches");
});

test("the swatch column always stays inside the canvas", () => {
  for (const count of [1, 2, 3]) {
    const layout = moodBoardLayout(count);
    assert.ok(
      layout.swatchLeft + SWATCH_WIDTH <= layout.width,
      `swatches overflow the board with ${count} figure(s)`
    );
  }
});
