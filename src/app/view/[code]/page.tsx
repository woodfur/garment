import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/server";

interface PageProps {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params;
  const admin = createAdminClient();
  const { data: branch } = await (admin as any)
    .from("branches")
    .select("name")
    .eq("view_code", code)
    .single();
  return {
    title: branch ? `${branch.name} — Uniform Schedule | Garment` : "Garment",
  };
}

export default async function PublicViewerPage({ params }: PageProps) {
  const { code } = await params;
  const admin = createAdminClient();

  const { data: branch } = await (admin as any)
    .from("branches")
    .select("id, name")
    .eq("view_code", code)
    .single();

  if (!branch) notFound();

  const today = new Date().toISOString().split("T")[0];
  const { data: schedules } = await (admin as any)
    .from("schedules")
    .select(
      `
      id, service_date, title, notes,
      assignments:schedule_assignments(
        id,
        gender,
        department:departments(id, name),
        combination:combinations(id, name, gender, preview_status, male_composite_url, female_composite_url, male_gif_url, female_gif_url)
      )
    `
    )
    .eq("branch_id", branch.id)
    .gte("service_date", today)
    .order("service_date", { ascending: true });

  return (
    <div className="viewer-root">
      <header className="viewer-header">
        <div className="viewer-header-inner">
          <h1 className="viewer-title">{branch.name}</h1>
          <p className="viewer-subtitle">Upcoming Service Uniform Schedule</p>
        </div>
      </header>

      <main className="viewer-main">
        {(!schedules || schedules.length === 0) && (
          <div className="viewer-empty">
            <span className="viewer-empty-icon">📅</span>
            <p>No upcoming service dates have been published yet.</p>
          </div>
        )}

        {schedules?.map((schedule: any) => (
          <div key={schedule.id} className="viewer-schedule-card">
            <div className="viewer-schedule-header">
              <div className="viewer-date-badge">
                {new Date(
                  schedule.service_date + "T00:00:00"
                ).toLocaleDateString("en-GB", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </div>
              <h2 className="viewer-schedule-title">{schedule.title}</h2>
              {schedule.notes && (
                <p className="viewer-schedule-notes">{schedule.notes}</p>
              )}
              <a
                href={`/api/public/schedules/${schedule.id}/package?code=${encodeURIComponent(code)}`}
                className="viewer-download-btn"
                style={{ display: "inline-flex", marginTop: "0.75rem", textDecoration: "none" }}
              >
                Download package
              </a>
            </div>

            {(!schedule.assignments || schedule.assignments.length === 0) && (
              <p className="viewer-no-outfits">No outfits assigned yet.</p>
            )}

            <div className="viewer-assignments">
              {schedule.assignments?.map((a: any) => {
                const gender = a.gender === "male" || a.gender === "female" ? a.gender : null;
                const imageUrl = gender === "male"
                  ? a.combination?.male_composite_url
                  : gender === "female"
                    ? a.combination?.female_composite_url
                    : null;
                const videoUrl = gender === "male"
                  ? a.combination?.male_gif_url
                  : gender === "female"
                    ? a.combination?.female_gif_url
                    : null;
                const assetUrl = imageUrl || videoUrl;
                return (
                <div key={a.id} className="viewer-assignment">
                  <div className="viewer-dept-label">{a.department?.name}</div>
                  {gender && (
                    <div style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", textTransform: "capitalize", marginBottom: "0.5rem" }}>
                      {gender}
                    </div>
                  )}

                  {a.combination?.preview_status === "ready" && assetUrl && gender ? (
                    <div className="viewer-previews">
                      <div className="viewer-preview-item">
                        <span className="viewer-gender-label">{gender === "male" ? "Male" : "Female"}</span>
                        {imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageUrl} alt={`${a.combination.name} ${gender} preview`} className="viewer-video" />
                        ) : (
                          <video
                            src={videoUrl}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="viewer-video"
                          />
                        )}
                        <a
                          href={`/api/public/combinations/${a.combination.id}/download?gender=${gender}&code=${encodeURIComponent(code)}`}
                          className="viewer-download-btn"
                        >
                          ↓ Download
                        </a>
                      </div>
                    </div>
                  ) : (
                    <div className="viewer-preview-pending">
                      <span className="viewer-clock">🕐</span>
                      <span>Outfit preview coming soon</span>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
