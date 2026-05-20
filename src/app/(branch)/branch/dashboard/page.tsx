export default function BranchDashboardPage() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100dvh",
      background: "var(--color-bg-primary)",
      fontFamily: "var(--font-body)",
    }}>
      <div style={{
        textAlign: "center",
        padding: "3rem",
        maxWidth: 480,
      }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: "var(--radius-lg)",
          background: "linear-gradient(135deg, var(--color-gold) 0%, var(--color-gold-light) 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 1.5rem",
          fontSize: "2rem",
        }}>
          🏗️
        </div>
        <h1 style={{
          fontFamily: "var(--font-heading)",
          fontSize: "1.75rem",
          marginBottom: "0.75rem",
          background: "linear-gradient(135deg, var(--color-gold) 0%, var(--color-gold-light) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          Branch Dashboard
        </h1>
        <p style={{ color: "var(--color-text-muted)", fontSize: "0.95rem", lineHeight: 1.6 }}>
          The branch leader portal is coming soon. You&apos;ve been invited as a branch leader — your dashboard will be ready shortly.
        </p>
      </div>
    </div>
  );
}
