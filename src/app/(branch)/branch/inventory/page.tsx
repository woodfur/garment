import type { Metadata } from "next";
import { Package } from "lucide-react";

export const metadata: Metadata = { title: "Inventory | Garment" };

export default function InventoryPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", textAlign: "center" }}>
      <div style={{
        width: 64, height: 64, borderRadius: "var(--radius-lg)",
        background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem",
      }}>
        <Package size={28} color="var(--color-gold)" />
      </div>
      <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem", marginBottom: "0.5rem" }}>Inventory</h1>
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", maxWidth: 360, lineHeight: 1.6 }}>
        Track uniform stock levels and get low-stock alerts for your branch. This feature is coming soon.
      </p>
    </div>
  );
}
