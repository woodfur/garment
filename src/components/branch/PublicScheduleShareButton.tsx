"use client";

import { useState } from "react";
import type { CSSProperties } from "react";

type ShareLinkResponse = {
  branch_name: string;
  view_code: string;
  public_url: string;
};

type PublicScheduleShareButtonProps = {
  className?: string;
  label?: string;
  style?: CSSProperties;
};

export default function PublicScheduleShareButton({
  className,
  label = "Share schedule",
  style,
}: PublicScheduleShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [shareLink, setShareLink] = useState<ShareLinkResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openShareModal() {
    setOpen(true);
    setCopied(false);
    if (shareLink) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/branch/share-link");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load share link");
        return;
      }
      setShareLink(data as ShareLinkResponse);
    } catch {
      setError("Failed to load share link");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!shareLink) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(shareLink.public_url);
      setCopied(true);
    } catch {
      setError("Copy failed. Select the link and copy it manually.");
    }
  }

  return (
    <>
      <button type="button" className={className} style={style} onClick={openShareModal}>
        {label}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(33,28,25,0.5)",
            backdropFilter: "blur(3px)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: 520, padding: "1.5rem", position: "relative" }}>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close share dialog"
              style={{
                position: "absolute",
                top: "0.9rem",
                right: "0.9rem",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "var(--color-text-muted)",
                fontSize: "1.1rem",
              }}
            >
              ×
            </button>

            <div className="eyebrow eyebrow-accent" style={{ marginBottom: "0.4rem" }}>
              Public schedule
            </div>
            <h2 className="display-serif" style={{ fontSize: "1.45rem", marginBottom: "1rem" }}>
              Share schedule link
            </h2>

            {loading && (
              <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "0.9rem" }}>
                Loading link...
              </p>
            )}

            {shareLink && (
              <div style={{ display: "grid", gap: "0.9rem" }}>
                <label style={{ display: "grid", gap: "0.35rem", fontSize: "0.82rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>
                  Link
                  <input
                    value={shareLink.public_url}
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                    style={{
                      width: "100%",
                      border: "1px solid var(--color-border)",
                      borderRadius: "var(--radius-md)",
                      padding: "0.7rem 0.85rem",
                      fontSize: "0.88rem",
                      color: "var(--color-text-primary)",
                      background: "var(--color-bg-elevated)",
                    }}
                  />
                </label>

                <div style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
                  <button type="button" className="btn-primary" onClick={copyLink} style={{ padding: "0.65rem 1rem" }}>
                    {copied ? "Copied" : "Copy link"}
                  </button>
                  <a
                    href={shareLink.public_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary"
                    style={{ padding: "0.65rem 1rem", textDecoration: "none" }}
                  >
                    Open public view
                  </a>
                </div>
              </div>
            )}

            {error && (
              <p style={{ margin: shareLink ? "0.85rem 0 0" : 0, color: "var(--color-error)", fontSize: "0.82rem" }}>
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
