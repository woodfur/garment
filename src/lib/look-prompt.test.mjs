import assert from "node:assert/strict";
import { test } from "node:test";
import { ordinal, planLook } from "./look-prompt.ts";

const photo = (zone, uniformName) => ({ zone, uniformName, imageUrl: `https://example.test/${zone}.png` });
const color = (zone, hex) => ({ zone, category: zone, hex });

test("planLook orders slots figure, chart, then garments in the order given", () => {
  const { slots } = planLook({
    gender: "female",
    colorItems: [color("top", "#CCF755")],
    photoItems: [photo("bottom", "Navy skirt"), photo("footwear", "Black flats")],
    hasFigureReference: true,
  });

  assert.deepEqual(
    slots.map((slot) => slot.kind),
    ["figure", "chart", "garment", "garment"]
  );
  assert.equal(slots[2].item.uniformName, "Navy skirt");
  assert.equal(slots[3].item.uniformName, "Black flats");
});

test("planLook omits the chart when there are no colour pieces", () => {
  const { slots, prompt } = planLook({
    gender: "male",
    colorItems: [],
    photoItems: [photo("top", "White shirt")],
    hasFigureReference: true,
  });

  assert.deepEqual(slots.map((slot) => slot.kind), ["figure", "garment"]);
  assert.doesNotMatch(prompt, /color chart/);
});

test("prompt ordinals match each garment's actual slot position", () => {
  const { slots, prompt } = planLook({
    gender: "male",
    colorItems: [color("top", "#00143D")],
    photoItems: [photo("bottom", "Grey trousers"), photo("footwear", "Brown shoes")],
    hasFigureReference: true,
  });

  // figure=0, chart=1, trousers=2, shoes=3
  assert.equal(slots[1].kind, "chart");
  assert.match(prompt, /the second reference image is a flat color chart/);
  assert.match(prompt, /the third reference image is a photograph of the real garment "Grey trousers"/);
  assert.match(prompt, /the fourth reference image is a photograph of the real garment "Brown shoes"/);
});

test("ordinals shift when there is no base figure", () => {
  const { prompt } = planLook({
    gender: "male",
    colorItems: [color("top", "#00143D")],
    photoItems: [photo("bottom", "Grey trousers")],
    hasFigureReference: false,
  });

  assert.match(prompt, /the first reference image is a flat color chart/);
  assert.match(prompt, /the second reference image is a photograph of the real garment "Grey trousers"/);
});

test("colour bars are mapped to specific garments in palette order", () => {
  const { prompt } = planLook({
    gender: "female",
    colorItems: [color("top", "#CCF755"), color("bottom", "#00143D")],
    photoItems: [],
    hasFigureReference: false,
  });

  assert.match(prompt, /color chart bar 1 \(chartreuse \/ lime green #CCF755 RGB\(204, 247, 85\)\) is the exact fabric color of a modest high-neck blouse/);
  assert.match(prompt, /color chart bar 2 \(deep navy #00143D RGB\(0, 20, 61\)\) is the exact fabric color of a knee-to-mid-calf A-line church uniform skirt/);
});

test("a top plus bottom look is forced to render as two separate pieces", () => {
  const female = planLook({
    gender: "female",
    colorItems: [color("top", "#CCF755"), color("bottom", "#00143D")],
    photoItems: [],
    hasFigureReference: false,
  }).prompt;
  assert.match(female, /clearly separated two-piece female church uniform/);

  const male = planLook({
    gender: "male",
    colorItems: [color("top", "#CCF755")],
    photoItems: [photo("bottom", "Trousers")],
    hasFigureReference: false,
  }).prompt;
  assert.match(male, /clearly separated two-piece male church uniform/);

  const dress = planLook({
    gender: "female",
    colorItems: [color("full_body", "#CCF755")],
    photoItems: [],
    hasFigureReference: false,
  }).prompt;
  assert.doesNotMatch(dress, /two-piece/);
});

test("every prompt keeps the modesty constraints", () => {
  const { prompt } = planLook({
    gender: "female",
    colorItems: [color("full_body", "#CCF755")],
    photoItems: [],
    hasFigureReference: false,
  });

  assert.match(prompt, /covered chest/);
  assert.match(prompt, /no bare shoulders/);
  assert.match(prompt, /closed-toe dress shoes/);
  assert.match(prompt, /Black African woman/);
});

test("a male top is not pinned to short sleeves, so it can sit under a suit jacket", () => {
  const { prompt } = planLook({
    gender: "male",
    colorItems: [],
    photoItems: [photo("top", "White shirt"), photo("outer", "Black suit jacket")],
    hasFigureReference: false,
  });

  assert.match(prompt, /collared church uniform shirt/);
  assert.doesNotMatch(prompt, /short-sleeve/);
  // The jacket is a separate garment layered over the shirt, not a replacement for it.
  assert.match(prompt, /tailored church uniform jacket or blazer/);
});

test("uploaded-piece looks include optional styling direction", () => {
  const { prompt } = planLook({
    gender: "male",
    colorItems: [],
    photoItems: [photo("top", "White linen shirt")],
    hasFigureReference: true,
    notes: "relaxed Wednesday styling, untucked shirt, clean loafers",
  });

  assert.match(prompt, /additional styling direction: relaxed Wednesday styling, untucked shirt, clean loafers/);
});

test("a male full-body piece renders as a suit, a female one as a dress", () => {
  const male = planLook({
    gender: "male",
    colorItems: [color("full_body", "#1C1C1C")],
    photoItems: [],
    hasFigureReference: false,
  }).prompt;
  assert.match(male, /suit or matching two-piece outfit/);

  // The women's dress wording must not drift when the men's is edited.
  const female = planLook({
    gender: "female",
    colorItems: [color("full_body", "#1C1C1C")],
    photoItems: [],
    hasFigureReference: false,
  }).prompt;
  assert.match(female, /modest knee-to-mid-calf A-line church uniform dress with a covered chest/);
  assert.doesNotMatch(female, /suit/);
});

test("female garment clauses are unchanged by the men's suit wording", () => {
  const { prompt } = planLook({
    gender: "female",
    colorItems: [color("top", "#CCF755"), color("bottom", "#00143D")],
    photoItems: [photo("footwear", "Black flats")],
    hasFigureReference: false,
  });

  assert.match(prompt, /modest high-neck blouse or church uniform top with covered shoulders/);
  assert.match(prompt, /knee-to-mid-calf A-line church uniform skirt/);
  assert.match(prompt, /glossy closed-toe low-heel court shoes/);
});

test("planLook rejects an empty look", () => {
  assert.throws(
    () => planLook({ gender: "male", colorItems: [], photoItems: [], hasFigureReference: true }),
    /at least one colour or photo item/
  );
});

test("ordinal degrades gracefully past the reference cap", () => {
  assert.equal(ordinal(0), "first");
  assert.equal(ordinal(15), "sixteenth");
  assert.equal(ordinal(20), "image number 21");
});
