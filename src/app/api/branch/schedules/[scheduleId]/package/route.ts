import { NextResponse } from "next/server";
import { requireBranchLeader } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/server";
import {
  buildSchedulePackageFilename,
  createSchedulePackagePdf,
  pickAssignmentAsset,
  type PackageCombinationAsset,
  type SchedulePackageAssignment,
} from "@/lib/schedule-package";
import { nearestColorName } from "@/lib/palette-prompt";
import { ZONE_LAYER_ORDER } from "@/types/zones";
import type { Gender } from "@/types/database";

export const runtime = "nodejs";

type SchedulePackageRow = {
  id: string;
  service_date: string;
  title: string;
  notes: string | null;
  branch: { name: string; view_code: string } | null;
  assignments: Array<{
    id: string;
    gender: Gender | null;
    department: { name: string } | null;
    combination: (PackageCombinationAsset & {
      id: string;
      name: string;
      preview_status: string;
      canvas_data: { mode?: string; palette?: Array<{ hex: string }> } | null;
    }) | null;
  }>;
};

type ZoneItemRow = {
  combination_id: string;
  gender: Gender;
  zone: string;
  uniform: { name: string } | null;
  inventory_item: { name: string } | null;
};

function isGender(value: unknown): value is Gender {
  return value === "male" || value === "female";
}

function buildAssignments(schedule: SchedulePackageRow, zoneItems: ZoneItemRow[]): SchedulePackageAssignment[] {
  const itemsFor = (combinationId: string, gender: Gender): SchedulePackageAssignment["items"] =>
    zoneItems
      .filter((item) => item.combination_id === combinationId && item.gender === gender && (item.uniform?.name || item.inventory_item?.name))
      .sort((a, b) => ZONE_LAYER_ORDER.indexOf(a.zone as never) - ZONE_LAYER_ORDER.indexOf(b.zone as never))
      .map((item) => ({ label: item.uniform?.name ?? item.inventory_item!.name }));

  return (schedule.assignments ?? [])
    .filter((assignment) => isGender(assignment.gender) && assignment.department && assignment.combination)
    .map((assignment) => {
      const gender = assignment.gender!;
      const combination = assignment.combination!;
      const palette = combination.canvas_data?.mode === "palette" ? combination.canvas_data.palette ?? [] : [];
      const items = palette.length > 0
        ? palette.map((colour) => ({ label: nearestColorName(colour.hex), hex: colour.hex }))
        : itemsFor(combination.id, gender);

      return {
        departmentName: assignment.department!.name,
        gender,
        combinationName: combination.name,
        imageUrl: combination.preview_status === "ready"
          ? pickAssignmentAsset({
              gender,
              combination,
            })
          : null,
        items,
      };
    });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ scheduleId: string }> },
) {
  const authResult = await requireBranchLeader();
  if (authResult instanceof NextResponse) return authResult;
  const { auth } = authResult;
  const { scheduleId } = await params;

  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from("schedules")
    .select(`
      id, service_date, title, notes,
      branch:branches(name, view_code),
      assignments:schedule_assignments(
        id, gender,
        department:departments(name),
        combination:combinations(id, name, preview_status, male_composite_url, female_composite_url, male_gif_url, female_gif_url, canvas_data)
      )
    `)
    .eq("id", scheduleId)
    .eq("branch_id", auth.branchId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  const schedule = data as SchedulePackageRow;
  const branchName = schedule.branch?.name ?? "Branch";
  const publicScheduleUrl = schedule.branch?.view_code
    ? new URL(`/view/${schedule.branch.view_code}`, req.url).toString()
    : null;
  const combinationIds = [
    ...new Set(
      (schedule.assignments ?? [])
        .map((assignment) => assignment.combination?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const { data: zoneItems } = combinationIds.length > 0
    ? await (admin as any)
        .from("combination_zone_items")
        .select("combination_id, gender, zone, uniform:uniforms(name), inventory_item:inventory_accessories(name)")
        .in("combination_id", combinationIds)
    : { data: [] };

  const pdf = await createSchedulePackagePdf({
    branchName,
    serviceTitle: schedule.title,
    serviceDate: schedule.service_date,
    notes: schedule.notes,
    publicScheduleUrl,
    assignments: buildAssignments(schedule, (zoneItems ?? []) as ZoneItemRow[]),
  });

  const filename = buildSchedulePackageFilename({
    branchName,
    serviceTitle: schedule.title,
    serviceDate: schedule.service_date,
  });

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, max-age=120",
    },
  });
}
