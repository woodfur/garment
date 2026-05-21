// Branch Dashboard loading skeleton
// Mirrors: 4 stat cards (auto-fit minmax 200px) + 2 content cards + quick actions card
export default function BranchDashboardLoading() {
  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Header skeleton */}
      <div style={{ marginBottom: "2rem" }}>
        <div className="skeleton" style={{ height: 32, width: 260, marginBottom: "0.5rem" }} />
        <div className="skeleton" style={{ height: 18, width: 320 }} />
      </div>

      {/* Stat cards — 4 columns matching auto-fit minmax(200px,1fr) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "1.25rem",
        marginBottom: "2rem",
      }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ padding: "1.5rem", display: "flex", alignItems: "center", gap: "1.25rem" }}>
            <div className="skeleton" style={{ width: 48, height: 48, borderRadius: "var(--radius-md)", flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="skeleton" style={{ height: 28, width: "60%", marginBottom: "0.5rem" }} />
              <div className="skeleton" style={{ height: 14, width: "80%" }} />
            </div>
          </div>
        ))}
      </div>

      {/* Schedule + Announcements cards — matching auto-fit minmax(300px,1fr) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: "1.5rem",
        marginBottom: "2rem",
      }}>
        {[0, 1].map((i) => (
          <div key={i} className="card" style={{ padding: "1.5rem" }}>
            {/* Card header */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.25rem" }}>
              <div className="skeleton" style={{ width: 17, height: 17, borderRadius: 4 }} />
              <div className="skeleton" style={{ height: 16, width: 160 }} />
            </div>
            {/* 3 list items */}
            {[0, 1, 2].map((j) => (
              <div key={j} style={{ padding: "0.875rem 1rem", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)", marginBottom: "0.75rem" }}>
                <div className="skeleton" style={{ height: 12, width: "40%", marginBottom: "0.4rem" }} />
                <div className="skeleton" style={{ height: 16, width: "75%", marginBottom: "0.3rem" }} />
                <div className="skeleton" style={{ height: 12, width: "55%" }} />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Quick actions card */}
      <div className="card" style={{ padding: "1.5rem" }}>
        <div className="skeleton" style={{ height: 16, width: 140, marginBottom: "1.25rem" }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ width: 140, height: 80, borderRadius: "var(--radius-lg)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
