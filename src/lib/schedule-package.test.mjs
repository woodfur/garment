import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSchedulePackageFilename,
  createSchedulePackagePdf,
  formatAssignmentLabel,
  pickAssignmentAsset,
} from "./schedule-package.ts";

describe("schedule package helpers", () => {
  it("builds a readable pdf filename", () => {
    assert.equal(
      buildSchedulePackageFilename({
        branchName: "Grace City Church",
        serviceTitle: "Sunday Service",
        serviceDate: "2026-07-19",
      }),
      "grace-city-church-sunday-service-2026-07-19.pdf",
    );
  });

  it("formats department and gender assignment labels", () => {
    assert.equal(
      formatAssignmentLabel({
        departmentName: "Choir",
        gender: "female",
      }),
      "Choir - Female",
    );
  });

  it("selects only the assigned gender asset", () => {
    assert.equal(
      pickAssignmentAsset({
        gender: "female",
        combination: {
          male_composite_url: "https://example.com/male.webp",
          female_composite_url: "https://example.com/female.webp",
          male_gif_url: null,
          female_gif_url: null,
        },
      }),
      "https://example.com/female.webp",
    );
  });

  it("creates a pdf package without requiring rendered images", async () => {
    const pdf = await createSchedulePackagePdf({
      branchName: "Grace City Church",
      serviceTitle: "Sunday Service",
      serviceDate: "2026-07-19",
      notes: "White tops and black shoes.",
      publicScheduleUrl: "https://example.com/view/GCC-4892",
      assignments: [
        {
          departmentName: "Choir",
          gender: "female",
          combinationName: "Choir Sunday White",
          imageUrl: null,
        },
      ],
    });

    assert.equal(Buffer.from(pdf.subarray(0, 5)).toString("utf8"), "%PDF-");
    assert.ok(pdf.length > 500);
  });

  it("renders department handout pages with gender headings and uniform breakdowns", async () => {
    const pdf = await createSchedulePackagePdf({
      branchName: "Kharis Church Freetown",
      serviceTitle: "Sunday Service",
      serviceDate: "2026-08-23",
      notes: null,
      assignments: [
        {
          departmentName: "Praise Team",
          gender: "female",
          combinationName: "Praise Ladies",
          imageUrl: null,
          items: [{ label: "White Shirt" }, { label: "Green Pencil Skirt" }],
        },
        {
          departmentName: "Praise Team",
          gender: "male",
          combinationName: "Praise Men",
          imageUrl: null,
          items: [{ label: "White Shirt" }, { label: "Black Suit Jacket" }, { label: "Black Trousers" }],
        },
      ],
    });

    const text = Buffer.from(pdf).toString("latin1");
    assert.match(text, /Kharis Church Freetown/);
    assert.match(text, /Praise Team/);
    assert.match(text, /Sunday Service - Sunday, 23 August 2026/);
    assert.match(text, /Ladies/);
    assert.match(text, /Men/);
    assert.match(text, /White Shirt/);
    assert.match(text, /Green Pencil Skirt/);
    assert.match(text, /Black Suit Jacket/);
    assert.doesNotMatch(text, /Praise Team - Female/);
  });
});
