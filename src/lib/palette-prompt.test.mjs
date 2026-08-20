import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPaletteLookName, buildPalettePrompt, colorChartInstructions, colorPromptPhrase } from "./palette-prompt.ts";

test("buildPalettePrompt locks generation to exact hex and RGB values without labels", () => {
  const prompt = buildPalettePrompt({
    departmentName: "Choir",
    gender: "female",
    palette: [
      { hex: "#CCF755", label: "Lime" },
      { hex: "#1C1C1C", label: "Brown" },
    ],
  });

  assert.match(prompt, /#CCF755/);
  assert.match(prompt, /RGB\(204, 247, 85\)/);
  assert.match(prompt, /#1C1C1C/);
  assert.match(prompt, /RGB\(28, 28, 28\)/);
  assert.match(prompt, /The outfit may use one, some, or all approved colors/);
  assert.match(prompt, /A single-color outfit is allowed/);
  assert.doesNotMatch(prompt, /Every approved color must appear/);
  assert.doesNotMatch(prompt, /Do not create a single-color outfit/);
  assert.doesNotMatch(prompt, /\bnear\b/);
  assert.doesNotMatch(prompt, /\bLime\b/);
  assert.doesNotMatch(prompt, /\bBrown\b/);
});

test("colorPromptPhrase adds model-readable color semantics from the hex value", () => {
  assert.equal(colorPromptPhrase("#94DBFF"), "powder blue / sky blue #94DBFF RGB(148, 219, 255)");
  assert.equal(colorPromptPhrase("#00143D"), "deep navy #00143D RGB(0, 20, 61)");
  assert.equal(colorPromptPhrase("#CCF755"), "chartreuse / lime green #CCF755 RGB(204, 247, 85)");
  assert.equal(colorPromptPhrase("#D97E08"), "burnt orange #D97E08 RGB(217, 126, 8)");
  assert.equal(colorPromptPhrase("#704832"), "chocolate brown #704832 RGB(112, 72, 50)");
  assert.equal(colorPromptPhrase("#F5E284"), "butter yellow / cream #F5E284 RGB(245, 226, 132)");
});

test("colorPromptPhrase covers common fashion color families", () => {
  assert.equal(colorPromptPhrase("#800020"), "burgundy #800020 RGB(128, 0, 32)");
  assert.equal(colorPromptPhrase("#FFFFF0"), "ivory #FFFFF0 RGB(255, 255, 240)");
  assert.equal(colorPromptPhrase("#50C878"), "emerald #50C878 RGB(80, 200, 120)");
  assert.equal(colorPromptPhrase("#F4C2C2"), "blush pink #F4C2C2 RGB(244, 194, 194)");
  assert.equal(colorPromptPhrase("#C3B091"), "khaki #C3B091 RGB(195, 176, 145)");
});

test("buildPalettePrompt points the model at the colour chart and forbids drawing it", () => {
  const palette = [{ hex: "#CCF755", label: null }, { hex: "#1C1C1C", label: null }];

  const chartOnly = buildPalettePrompt({ departmentName: "Choir", gender: "female", palette });
  assert.match(chartOnly, /the first reference image is a flat color chart/);
  assert.match(chartOnly, /never draw the chart/);

  const withFigure = buildPalettePrompt({
    departmentName: "Choir",
    gender: "female",
    palette,
    hasFigureReference: true,
  });
  assert.match(withFigure, /the second reference image is a flat color chart/);
  assert.match(withFigure, /Redress the person in the first reference photograph/);
  assert.match(withFigure, /never draw the chart/);
});

test("colorChartInstructions numbers the chart around an optional figure reference", () => {
  assert.match(colorChartInstructions(false)[0], /first reference image/);
  assert.match(colorChartInstructions(true)[0], /second reference image/);
});

test("buildPaletteLookName falls back to the department palette name", () => {
  assert.equal(buildPaletteLookName("", "Choir"), "Choir palette");
  assert.equal(buildPaletteLookName("  ", "Ushers"), "Ushers palette");
  assert.equal(buildPaletteLookName("Wednesday", "Choir"), "Wednesday");
});
