import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildUniformReminderMessage,
  buildUniformReminderPayload,
  getReminderTargetDate,
} from "./uniform-reminders.ts";

test("targets Wednesday when the reminder runs on Monday", () => {
  assert.deepEqual(
    getReminderTargetDate(new Date("2026-07-13T10:00:00Z")),
    { reminderKind: "wednesday", targetDate: "2026-07-15" }
  );
});

test("targets Sunday when the reminder runs on Thursday", () => {
  assert.deepEqual(
    getReminderTargetDate(new Date("2026-07-16T10:00:00Z")),
    { reminderKind: "sunday", targetDate: "2026-07-19" }
  );
});

test("does not target a service date on unsupported days", () => {
  assert.equal(getReminderTargetDate(new Date("2026-07-14T10:00:00Z")), null);
});

test("builds a leader message with choir, ushers, and public link", () => {
  const message = buildUniformReminderMessage({
    serviceTitle: "Wednesday Service",
    serviceDate: "2026-07-15",
    publicScheduleUrl: "https://garment.example/view/ABC123",
    assignments: [
      {
        departmentName: "Choir",
        combinationName: "Purple top and black skirt",
        previewStatus: "ready",
      },
      {
        departmentName: "Ushers",
        combinationName: "Black suit and purple tie",
        previewStatus: "ready",
      },
    ],
  });

  assert.match(message, /Uniform reminder for Wednesday Service - Wednesday, 15 July 2026/);
  assert.match(message, /Choir: Purple top and black skirt/);
  assert.match(message, /Ushers: Black suit and purple tie/);
  assert.match(message, /https:\/\/garment\.example\/view\/ABC123/);
});

test("marks missing choir or ushers assignments without failing", () => {
  const message = buildUniformReminderMessage({
    serviceTitle: "Sunday Service",
    serviceDate: "2026-07-19",
    publicScheduleUrl: "https://garment.example/view/ABC123",
    assignments: [
      {
        departmentName: "Choir",
        combinationName: "White dress",
        previewStatus: "processing",
      },
    ],
  });

  assert.match(message, /Choir: White dress \(preview processing\)/);
  assert.match(message, /Ushers: Not assigned yet/);
});

test("builds the stable Zapier payload around the leader message", () => {
  const payload = buildUniformReminderPayload({
    branchName: "Kharis Church",
    serviceTitle: "Sunday Service",
    serviceDate: "2026-07-19",
    reminderKind: "sunday",
    publicScheduleUrl: "https://garment.example/view/ABC123",
    assignments: [
      {
        departmentName: "Choir",
        combinationName: "White dress",
        previewStatus: "ready",
      },
    ],
  });

  assert.equal(payload.branchName, "Kharis Church");
  assert.equal(payload.reminderKind, "sunday");
  assert.equal(payload.publicScheduleUrl, "https://garment.example/view/ABC123");
  assert.equal(payload.assignments.length, 1);
  assert.match(payload.leaderMessage, /Sunday Service/);
});
