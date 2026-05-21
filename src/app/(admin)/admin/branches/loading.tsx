// Admin Branches loading skeleton
// Mirrors: header + Create Branch button + grid of branch cards (auto-fill minmax 320px)
export default function BranchesLoading() {
  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem" }}>
        <div>
          <div className="skeleton" style={{ height: 32, width: 140, marginBottom: "0.5rem" }} />
          <div className="skeleton" style={{ height: 16, width: 200 }} />
        </div>
        <div className="skeleton" style={{ height: 38, width: 130, borderRadius: "var(--radius-md)" }} />
      </div>

      {/* Branch card grid — matching auto-fill minmax(320px,1fr) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.25rem" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ padding: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
              <div className="skeleton" style={{ width: 44, height: 44, borderRadius: "var(--radius-md)", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: 18, width: "70%", marginBottom: "0.4rem" }} />
                <div className="skeleton" style={{ height: 14, width: "50%" }} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div className="skeleton" style={{ height: 22, width: 80, borderRadius: "var(--radius-full)" }} />
              <div className="skeleton" style={{ height: 14, width: 60 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
