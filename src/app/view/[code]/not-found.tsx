import Link from "next/link";

export default function ViewerNotFound() {
  return (
    <div className="viewer-root" style={{ textAlign: "center", paddingTop: 80 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        Branch Not Found
      </h1>
      <p
        style={{
          color: "var(--color-text-secondary)",
          marginBottom: 24,
        }}
      >
        The link you followed may be invalid or the branch may no longer exist.
      </p>
      <Link href="/" style={{ color: "var(--color-primary)" }}>
        Return home
      </Link>
    </div>
  );
}
