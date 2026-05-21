export default function CombinationsLoading() {
  return (
    <div style={{ maxWidth: 1100 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1.5rem" }}>
        <div>
          <div className="skeleton" style={{ height: 32, width: 180, marginBottom: "0.5rem" }} />
          <div className="skeleton" style={{ height: 14, width: 80 }} />
        </div>
        <div className="skeleton" style={{ height: 38, width: 170, borderRadius: "var(--radius-md)" }} />
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {[60, 70, 80].map((w, i) => <div key={i} className="skeleton" style={{ height: 28, width: w, borderRadius: "var(--radius-full)" }} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div className="skeleton" style={{ height: 200 }} />
            <div style={{ padding: "0.875rem" }}>
              <div className="skeleton" style={{ height: 16, marginBottom: "0.5rem" }} />
              <div className="skeleton" style={{ height: 18, width: 70, borderRadius: "var(--radius-full)", marginBottom: "0.75rem" }} />
              <div className="skeleton" style={{ height: 30, borderRadius: "var(--radius-md)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
