import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_PALETTE_NOTES,
  buildPaletteLookName,
  buildPalettePrompt,
  colorChartInstructions,
  colorPromptPhrase,
  nearestColorName,
  sanitizePaletteNotes,
} from "./palette-prompt.ts";

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

test("buildPalettePrompt styles palette looks as Wednesday smart casual instead of formal Sunday wear", () => {
  const palette = [{ hex: "#94DBFF", label: null }, { hex: "#00143D", label: null }];
  const male = buildPalettePrompt({ departmentName: "Ushers", gender: "male", palette });
  const female = buildPalettePrompt({ departmentName: "Choir", gender: "female", palette });

  assert.match(male, /Wednesday service smart-casual church outfit/);
  assert.match(male, /untucked collared shirt/);
  assert.match(male, /linen shirt/);
  assert.match(male, /sneakers, trainers, loafers/);
  assert.doesNotMatch(male, /closed-toe dress shoes/);

  assert.match(female, /Wednesday service smart-casual church outfit/);
  assert.match(female, /jean trousers, wide-leg trousers, dress pants/);
  assert.match(female, /sneakers, trainers, flats, loafers/);
  assert.doesNotMatch(female, /clearly separate blouse plus knee-to-mid-calf skirt/);
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

test("optional direction reaches the prompt without displacing the hard rules", () => {
  const palette = [{ hex: "#94DBFF", label: null }, { hex: "#00143D", label: null }];
  const prompt = buildPalettePrompt({
    departmentName: "Choir",
    gender: "female",
    palette,
    notes: "linen texture, add a simple brooch",
  });

  assert.match(prompt, /additional styling direction: linen texture, add a simple brooch/);
  // Subordinated to the palette, so direction cannot smuggle in an unapproved colour.
  assert.match(prompt, /only within the approved colors/);
  // The non-negotiables must still be present, and still read after the direction.
  assert.match(prompt, /CRITICAL COLOR LOCK/);
  assert.match(prompt, /covered chest/);
  assert.match(prompt, /no bare shoulders/);
  assert.ok(
    prompt.indexOf("additional styling direction") < prompt.indexOf("no bare shoulders"),
    "modesty rules must come after the user's direction"
  );
});

test("a prompt with no direction gains no empty clause", () => {
  const palette = [{ hex: "#94DBFF", label: null }, { hex: "#00143D", label: null }];
  for (const notes of [undefined, null, "", "   "]) {
    const prompt = buildPalettePrompt({ departmentName: "Choir", gender: "male", palette, notes: sanitizePaletteNotes(notes) });
    assert.doesNotMatch(prompt, /additional styling direction/);
  }
});

test("direction is collapsed to one line and capped", () => {
  assert.equal(sanitizePaletteNotes("  linen   texture\n\nwith a brooch "), "linen texture with a brooch");
  assert.equal(sanitizePaletteNotes(""), null);
  assert.equal(sanitizePaletteNotes("   "), null);
  assert.equal(sanitizePaletteNotes(42), null);
  assert.equal(sanitizePaletteNotes("x".repeat(MAX_PALETTE_NOTES + 50)).length, MAX_PALETTE_NOTES);
});

test("nearestColorName gives a readable name for a hex", () => {
  assert.equal(nearestColorName("#E6D7C3"), "pearl grey");
  assert.equal(nearestColorName("#704832"), "chocolate brown");
});

test("an unnamed palette look is named after its dominant colour", () => {
  // Not after a department — palette looks apply to all of them, so department names
  // would make every look in the list read the same.
  const blue = [{ hex: "#94DBFF", label: null }, { hex: "#00143D", label: null }];
  assert.equal(buildPaletteLookName("", blue), "Powder blue / sky blue palette");
  assert.equal(buildPaletteLookName("   ", blue), "Powder blue / sky blue palette");
  assert.equal(buildPaletteLookName("Wednesday", blue), "Wednesday");
  assert.equal(buildPaletteLookName("", []), "Colour palette");
});

test("the department clause is dropped when there is no single department", () => {
  const palette = [{ hex: "#94DBFF", label: null }, { hex: "#00143D", label: null }];
  const shared = buildPalettePrompt({ gender: "female", palette });
  assert.match(shared, /wearing a coordinated Wednesday service smart-casual church outfit,/);
  assert.doesNotMatch(shared, /department/);

  const named = buildPalettePrompt({ departmentName: "Choir", gender: "female", palette });
  assert.match(named, /for the Choir department/);
});
