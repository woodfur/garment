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
});
