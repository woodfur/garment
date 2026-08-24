import type { Metadata } from "next";
import InventoryPageClient from "@/components/branch/InventoryPageClient";

export const metadata: Metadata = { title: "Inventory | Garment" };

export default function InventoryPage() {
  return <InventoryPageClient />;
}
