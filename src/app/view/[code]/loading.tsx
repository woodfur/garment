export default function ViewerLoading() {
  return (
    <div className="viewer-root">
      <header className="viewer-header">
        <div className="viewer-header-inner">
          <div
            className="skeleton"
            style={{ height: 32, width: 200, borderRadius: 8, marginBottom: 8 }}
          />
          <div
            className="skeleton"
            style={{ height: 18, width: 280, borderRadius: 6 }}
          />
        </div>
      </header>
      <main className="viewer-main">
        {[1, 2].map((i) => (
          <div key={i} className="viewer-schedule-card">
            <div
              className="skeleton"
              style={{ height: 24, width: 180, borderRadius: 6, marginBottom: 12 }}
            />
            <div
              className="skeleton"
              style={{ height: 16, width: 140, borderRadius: 6, marginBottom: 20 }}
            />
            <div style={{ display: "flex", gap: 16 }}>
              <div
                className="skeleton"
                style={{ height: 300, width: "100%", borderRadius: 12 }}
              />
              <div
                className="skeleton"
                style={{ height: 300, width: "100%", borderRadius: 12 }}
              />
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
