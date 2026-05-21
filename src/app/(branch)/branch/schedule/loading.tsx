export default function ScheduleLoading() {
  return (
    <div style={{ padding: 32 }}>
      <div
        className="skeleton"
        style={{ height: 32, width: 200, borderRadius: 8, marginBottom: 24 }}
      />
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="skeleton"
          style={{ height: 160, borderRadius: 12, marginBottom: 16 }}
        />
      ))}
    </div>
  );
}
