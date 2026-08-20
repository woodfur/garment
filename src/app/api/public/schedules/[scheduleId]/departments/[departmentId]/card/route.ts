import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { buildShareCardFilename, renderShareCard, type ShareCardColumn, type ShareCardItem } from "@/lib/share-card";
import { nearestColorName } from "@/lib/palette-prompt";
import { ZONE_LAYER_ORDER } from "@/types/zones";
import type { Gender } from "@/types/database";

export const runtime = "nodejs";

/**
 * One department's uniform for one service, as a single shareable PNG.
 *
 * Replaces the image a leader forwards into a department WhatsApp group. Public in the
 * same sense as /view/[code]: the branch view code is the only secret, matching the
 * existing package route.
 */

type ScheduleRow = {
  id: string;
  service_date: string;
  title: string;
  branch: { name: string; view_code: string } | null;
  assignments: Array<{
    gender: Gender | null;
    department_id: string;
    department: { id: string; name: string } | null;
    combination: {
      id: string;
      name: string;
      preview_status: string;
      male_composite_url: string | null;
      female_composite_url: string | null;
      canvas_data: { mode?: string; palette?: Array<{ hex: string }> } | null;
    } | null;
  }>;
};

type PublicQuery = {
  select(columns: string): PublicQuery;
  eq(column: string, value: string): PublicQuery;
  in(column: string, values: string[]): Promise<{ data: unknown; error: unknown }>;
  single(): Promise<{ data: unknown; error: { message: string } | null }>;
};

type PublicDb = { from(table: string): PublicQuery };

type ZoneItemRow = {
  combination_id: string;
  gender: Gender;
  zone: string;
  uniform: { name: string } | null;
};

async function downloadImage(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    // A missing render should still produce a card, just without that figure.
    return null;
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ scheduleId: string; departmentId: string }> }
) {
  const { scheduleId, departmentId } = await params;
  const code = new URL(req.url).searchParams.get("code")?.trim();
  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 });

  const admin = createAdminClient();
  const db = admin as unknown as PublicDb;
  const { data, error } = await db
    .from("schedules")
    .select(`
      id, service_date, title,
      branch:branches(name, view_code),
      assignments:schedule_assignments(
        gender, department_id,
        department:departments(id, name),
        combination:combinations(id, name, preview_status, male_composite_url, female_composite_url, canvas_data)
      )
    `)
    .eq("id", scheduleId)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const schedule = data as ScheduleRow;
  if (!schedule.branch || schedule.branch.view_code !== code) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const forDepartment = (schedule.assignments ?? []).filter(
    (a) => a.department_id === departmentId && a.gender && a.combination
  );
  if (forDepartment.length === 0) {
    return NextResponse.json({ error: "No uniform assigned for that department" }, { status: 404 });
  }

  // Garment names come from the zone items, ordered the way the outfit layers.
  const combinationIds = [...new Set(forDepartment.map((a) => a.combination!.id))];
  const { data: zoneItems } = await db
    .from("combination_zone_items")
    .select("combination_id, gender, zone, uniform:uniforms(name)")
    .in("combination_id", combinationIds) as { data: ZoneItemRow[] | null };

  const itemsFor = (combinationId: string, gender: Gender): ShareCardItem[] =>
    (zoneItems ?? [])
      .filter((item) => item.combination_id === combinationId && item.gender === gender && item.uniform?.name)
      .sort((a, b) => ZONE_LAYER_ORDER.indexOf(a.zone as never) - ZONE_LAYER_ORDER.indexOf(b.zone as never))
      .map((item) => ({ label: item.uniform!.name }));

  const columns: ShareCardColumn[] = [];
  for (const assignment of forDepartment) {
    const gender = assignment.gender!;
    const combo = assignment.combination!;
    const url = gender === "male" ? combo.male_composite_url : combo.female_composite_url;

    // A palette look has no garment rows — list its approved colours instead.
    const palette = combo.canvas_data?.mode === "palette" ? combo.canvas_data.palette ?? [] : [];
    // A hex code means nothing to a congregation member — name the colour and show it.
    const items: ShareCardItem[] = palette.length > 0
      ? palette.map((colour) => ({ label: nearestColorName(colour.hex), hex: colour.hex }))
      : itemsFor(combo.id, gender);

    columns.push({
      gender,
      image: await downloadImage(combo.preview_status === "ready" ? url : null),
      lookName: combo.name,
      items: items.length > 0 ? items : [{ label: combo.name }],
    });
  }

  const departmentName = forDepartment[0].department?.name ?? "Uniform";
  const png = await renderShareCard({
    branchName: schedule.branch.name,
    departmentName,
    serviceTitle: schedule.title,
    serviceDate: schedule.service_date,
    columns,
  });

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${buildShareCardFilename({ departmentName, serviceDate: schedule.service_date })}"`,
      "Cache-Control": "public, max-age=120",
    },
  });
}
