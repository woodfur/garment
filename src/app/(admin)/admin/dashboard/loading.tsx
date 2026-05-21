// Admin Dashboard loading skeleton
// Mirrors: 3 stat cards (repeat 3) + recent branches table
export default function AdminDashboardLoading() {
  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <div className="skeleton" style={{ height: 32, width: 220, marginBottom: "0.5rem" }} />
        <div className="skeleton" style={{ height: 18, width: 360 }} />
      </div>

      {/* 3 stat cards — matching repeat(3, 1fr) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1.25rem", marginBottom: "2rem" }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="card" style={{ padding: "1.5rem", display: "flex", alignItems: "center", gap: "1.25rem" }}>
            <div className="skeleton" style={{ width: 48, height: 48, borderRadius: "var(--radius-md)", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ height: 28, width: "50%", marginBottom: "0.5rem" }} />
              <div className="skeleton" style={{ height: 14, width: "70%" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Branches table card */}
      <div className="card" style={{ padding: "1.5rem" }}>
        {/* Table header row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <div className="skeleton" style={{ height: 20, width: 160 }} />
          <div className="skeleton" style={{ height: 34, width: 110, borderRadius: "var(--radius-md)" }} />
        </div>
        {/* 5 table rows */}
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} style={{
            display: "grid",
            gridTemplateColumns: "2fr 1.5fr 1fr 1fr 80px",
            gap: "1rem",
            padding: "0.875rem 0",
            borderBottom: "1px solid var(--color-border-subtle)",
            alignItems: "center",
          }}>
            <div className="skeleton" style={{ height: 16, width: "80%" }} />
            <div className="skeleton" style={{ height: 14, width: "70%" }} />
            <div className="skeleton" style={{ height: 22, width: 80, borderRadius: "var(--radius-full)" }} />
            <div className="skeleton" style={{ height: 14, width: "60%" }} />
            <div className="skeleton" style={{ height: 14, width: 40, marginLeft: "auto" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
