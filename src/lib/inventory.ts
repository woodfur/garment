import type { Gender } from "@/types/database";

export type PersonGender = Gender;
export type InventoryAssignmentStatus =
  | "assigned"
  | "returned"
  | "damaged"
  | "destroyed"
  | "missing";
export type InventoryResolutionStatus = Exclude<InventoryAssignmentStatus, "assigned">;
export type InventoryStockEventType =
  | "manual_adjustment"
  | "assigned"
  | "returned"
  | "damaged"
  | "destroyed"
  | "missing";

export type InventoryItemRow = {
  id: string;
  branch_id: string;
  category_id: string;
  name: string;
  quantity: number;
  image_url: string | null;
  raw_image_url: string | null;
  storage_path: string | null;
  bg_removed: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export function availableQuantity({
  quantity,
  unresolvedQuantity,
}: {
  quantity: number;
  unresolvedQuantity: number;
}): number {
  return Math.max(0, quantity - unresolvedQuantity);
}

export function assertCanAssign({
  itemName,
  quantity,
  unresolvedQuantity,
  requestedQuantity,
}: {
  itemName: string;
  quantity: number;
  unresolvedQuantity: number;
  requestedQuantity: number;
}): void {
  const available = availableQuantity({ quantity, unresolvedQuantity });
  if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
    throw new Error("Quantity must be a positive whole number");
  }
  if (requestedQuantity > available) {
    throw new Error(`Only ${available} ${itemName} available`);
  }
}

export function stockDeltaForResolution(status: InventoryResolutionStatus, quantity: number): number {
  if (status === "returned") return 0;
  return -Math.abs(quantity);
}

function startOfUtcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function serviceUtcDay(serviceDate: string): number {
  const date = new Date(`${serviceDate}T00:00:00Z`);
  return startOfUtcDay(date);
}

export function isOverdueAssignmentLine({
  status,
  serviceDate,
  now = new Date(),
}: {
  status: InventoryAssignmentStatus;
  serviceDate: string;
  now?: Date;
}): boolean {
  if (status !== "assigned") return false;
  return serviceUtcDay(serviceDate) < startOfUtcDay(now);
}

export function resolvedWasOverdue({
  existingWasOverdue,
  serviceDate,
  now = new Date(),
}: {
  existingWasOverdue: boolean;
  serviceDate: string;
  now?: Date;
}): boolean {
  return existingWasOverdue || serviceUtcDay(serviceDate) < startOfUtcDay(now);
}

export type InventoryStockRow = {
  id: string;
  quantity: number;
  assigned_quantity: number;
  available_quantity: number;
};

export function withStockSummary<T extends { id: string; quantity: number }>(
  rows: T[],
  assignedByItemId: Map<string, number>
): Array<T & InventoryStockRow> {
  return rows.map((row) => {
    const assigned = assignedByItemId.get(row.id) ?? 0;
    return {
      ...row,
      assigned_quantity: assigned,
      available_quantity: availableQuantity({
        quantity: row.quantity,
        unresolvedQuantity: assigned,
      }),
    };
  });
}
