import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRenderedFilename,
  getRenderedAsset,
  parseDownloadGender,
} from "./render-download.ts";

const combo = {
  name: "Choir Sunday Look",
  male_composite_url: "https://example.com/male.webp",
  female_composite_url: "https://example.com/female.webp",
  male_gif_url: "https://example.com/male.gif",
  female_gif_url: "https://example.com/female.gif",
};

test("parseDownloadGender accepts male and female only", () => {
  assert.equal(parseDownloadGender("male"), "male");
  assert.equal(parseDownloadGender("female"), "female");
  assert.equal(parseDownloadGender("other"), null);
  assert.equal(parseDownloadGender(null), null);
});

test("getRenderedAsset prefers still composite images over gifs", () => {
  assert.deepEqual(getRenderedAsset(combo, "male"), {
    url: "https://example.com/male.webp",
    fallbackExtension: "webp",
  });
  assert.deepEqual(getRenderedAsset(combo, "female"), {
    url: "https://example.com/female.webp",
    fallbackExtension: "webp",
  });
});

test("getRenderedAsset falls back to gif when no composite image exists", () => {
  assert.deepEqual(
    getRenderedAsset({ ...combo, male_composite_url: null }, "male"),
    {
      url: "https://example.com/male.gif",
      fallbackExtension: "gif",
    }
  );
});

test("buildRenderedFilename creates a stable attachment filename", () => {
  assert.equal(
    buildRenderedFilename({
      combinationName: "Choir Sunday Look!",
      gender: "female",
      extension: "webp",
    }),
    "choir-sunday-look-female.webp"
  );
});
