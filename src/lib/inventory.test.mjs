import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assertCanAssign,
  availableQuantity,
  isOverdueAssignmentLine,
  resolvedWasOverdue,
  stockDeltaForResolution,
  withStockSummary,
} from "./inventory.ts";

test("availableQuantity subtracts unresolved assignments", () => {
  assert.equal(availableQuantity({ quantity: 10, unresolvedQuantity: 4 }), 6);
  assert.equal(availableQuantity({ quantity: 3, unresolvedQuantity: 9 }), 0);
});

test("assertCanAssign blocks over-assignment", () => {
  assert.doesNotThrow(() =>
    assertCanAssign({
      itemName: "Orange tie",
      quantity: 10,
      unresolvedQuantity: 8,
      requestedQuantity: 2,
    })
  );

  assert.throws(
    () =>
      assertCanAssign({
        itemName: "Orange tie",
        quantity: 10,
        unresolvedQuantity: 8,
        requestedQuantity: 3,
      }),
    /Only 2 Orange tie available/
  );
});

test("stockDeltaForResolution returns usable stock effects", () => {
  assert.equal(stockDeltaForResolution("returned", 2), 0);
  assert.equal(stockDeltaForResolution("damaged", 2), -2);
  assert.equal(stockDeltaForResolution("destroyed", 1), -1);
  assert.equal(stockDeltaForResolution("missing", 4), -4);
});

test("overdue lines are assigned lines past the service date", () => {
  assert.equal(
    isOverdueAssignmentLine({
      status: "assigned",
      serviceDate: "2026-08-23",
      now: new Date("2026-08-24T12:00:00Z"),
    }),
    true
  );
  assert.equal(
    isOverdueAssignmentLine({
      status: "returned",
      serviceDate: "2026-08-23",
      now: new Date("2026-08-24T12:00:00Z"),
    }),
    false
  );
  assert.equal(
    isOverdueAssignmentLine({
      status: "assigned",
      serviceDate: "2026-08-24",
      now: new Date("2026-08-24T12:00:00Z"),
    }),
    false
  );
});

test("resolvedWasOverdue preserves previous overdue state and detects late resolution", () => {
  assert.equal(
    resolvedWasOverdue({
      existingWasOverdue: true,
      serviceDate: "2026-08-25",
      now: new Date("2026-08-24T12:00:00Z"),
    }),
    true
  );
  assert.equal(
    resolvedWasOverdue({
      existingWasOverdue: false,
      serviceDate: "2026-08-23",
      now: new Date("2026-08-24T12:00:00Z"),
    }),
    true
  );
  assert.equal(
    resolvedWasOverdue({
      existingWasOverdue: false,
      serviceDate: "2026-08-24",
      now: new Date("2026-08-24T12:00:00Z"),
    }),
    false
  );
});

test("withStockSummary adds assigned and available quantities to item rows", () => {
  const rows = [
    { id: "orange", name: "Orange tie", quantity: 10 },
    { id: "blue", name: "Blue tie", quantity: 3 },
  ];
  const assigned = new Map([
    ["orange", 4],
    ["blue", 9],
  ]);

  assert.deepEqual(withStockSummary(rows, assigned), [
    { id: "orange", name: "Orange tie", quantity: 10, assigned_quantity: 4, available_quantity: 6 },
    { id: "blue", name: "Blue tie", quantity: 3, assigned_quantity: 9, available_quantity: 0 },
  ]);
});
