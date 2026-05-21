export default function UniformsLoading() {
  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <div className="skeleton" style={{ height: 32, width: 150, marginBottom: "0.5rem" }} />
          <div className="skeleton" style={{ height: 14, width: 80 }} />
        </div>
        <div className="skeleton" style={{ height: 38, width: 130, borderRadius: "var(--radius-md)" }} />
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {[80, 70, 90, 75].map((w, i) => <div key={i} className="skeleton" style={{ height: 28, width: w, borderRadius: "var(--radius-full)" }} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="skeleton" style={{ height: 180 }} />
            <div style={{ padding: "0.875rem" }}>
              <div className="skeleton" style={{ height: 16, marginBottom: "0.5rem" }} />
              <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.75rem" }}>
                <div className="skeleton" style={{ height: 18, width: 55, borderRadius: "var(--radius-full)" }} />
                <div className="skeleton" style={{ height: 18, width: 65, borderRadius: "var(--radius-full)" }} />
              </div>
              <div className="skeleton" style={{ height: 30, borderRadius: "var(--radius-md)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
