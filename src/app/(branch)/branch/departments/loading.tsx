export default function DepartmentsLoading() {
  return (
    <div style={{ maxWidth: 800 }}>
      {/* Header skeleton */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem" }}>
        <div>
          <div className="skeleton" style={{ height: 32, width: 180, marginBottom: "0.5rem" }} />
          <div className="skeleton" style={{ height: 16, width: 280 }} />
        </div>
        <div className="skeleton" style={{ height: 38, width: 150, borderRadius: "var(--radius-md)" }} />
      </div>

      {/* 3 card skeletons */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="card" style={{ padding: "1.25rem 1.5rem", marginBottom: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <div className="skeleton" style={{ width: 32, height: 32, borderRadius: "var(--radius-md)", flexShrink: 0 }} />
            <div className="skeleton" style={{ height: 20, width: "40%" }} />
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <div className="skeleton" style={{ height: 22, width: 80, borderRadius: "var(--radius-full)" }} />
            <div className="skeleton" style={{ height: 22, width: 100, borderRadius: "var(--radius-full)" }} />
            <div className="skeleton" style={{ height: 22, width: 70, borderRadius: "var(--radius-full)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
