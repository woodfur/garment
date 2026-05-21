import type { Metadata } from "next";
import { Calendar } from "lucide-react";

export const metadata: Metadata = { title: "Schedule | Garment" };

export default function SchedulePage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", textAlign: "center" }}>
      <div style={{
        width: 64, height: 64, borderRadius: "var(--radius-lg)",
        background: "rgba(155,135,245,0.1)", border: "1px solid rgba(155,135,245,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1.5rem",
      }}>
        <Calendar size={28} color="var(--color-gold)" />
      </div>
      <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.5rem", marginBottom: "0.5rem" }}>Schedule</h1>
      <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", maxWidth: 360, lineHeight: 1.6 }}>
        Plan and assign uniform combinations to upcoming service dates. This feature is coming soon.
      </p>
    </div>
  );
}
