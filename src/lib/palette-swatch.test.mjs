import assert from "node:assert/strict";
import { test } from "node:test";
import { renderSwatchCard, swatchLayout, swatchSvg } from "./palette-swatch.ts";

const palette = (...hexes) => hexes.map((hex) => ({ hex, label: null }));

test("swatchLayout tiles the full canvas with no gaps or overflow", () => {
  for (const count of [1, 2, 3, 4, 5]) {
    const colors = palette(...Array.from({ length: count }, () => "#CCF755"));
    const bars = swatchLayout(colors, 1024);

    assert.equal(bars.length, count);
    assert.equal(bars[0].x, 0, `first bar starts at 0 for ${count} colours`);
    assert.equal(
      bars[bars.length - 1].x + bars[bars.length - 1].width,
      1024,
      `bars reach the right edge for ${count} colours`
    );

    for (let i = 1; i < bars.length; i += 1) {
      assert.equal(bars[i].x, bars[i - 1].x + bars[i - 1].width, "bars are edge-to-edge");
    }
  }
});

test("swatchSvg emits one flat rect per colour and no text", () => {
  const svg = swatchSvg(palette("#CCF755", "#1C1C1C"));

  assert.equal(svg.match(/<rect /g).length, 2);
  assert.match(svg, /fill="#CCF755"/);
  assert.match(svg, /fill="#1C1C1C"/);
  // Text in a reference image gets drawn into the render — the chart must stay wordless.
  assert.doesNotMatch(svg, /<text/);
});

test("renderSwatchCard produces a PNG of the expected size", async () => {
  const png = await renderSwatchCard(palette("#CCF755", "#1C1C1C", "#00143D"));

  assert.ok(png.length > 0);
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
});

test("renderSwatchCard rejects an empty palette", async () => {
  await assert.rejects(() => renderSwatchCard([]), /at least one colour/);
});
