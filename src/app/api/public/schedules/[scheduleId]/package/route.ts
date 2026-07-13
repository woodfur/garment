import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  buildSchedulePackageFilename,
  createSchedulePackagePdf,
  pickAssignmentAsset,
  type PackageCombinationAsset,
  type SchedulePackageAssignment,
} from "@/lib/schedule-package";
import type { Gender } from "@/types/database";

export const runtime = "nodejs";

type SchedulePackageRow = {
  id: string;
  branch_id: string;
  service_date: string;
  title: string;
  notes: string | null;
  branch: { id: string; name: string; view_code: string } | null;
  assignments: Array<{
    id: string;
    gender: Gender | null;
    department: { name: string } | null;
    combination: (PackageCombinationAsset & {
      name: string;
      preview_status: string;
    }) | null;
  }>;
};

function isGender(value: unknown): value is Gender {
  return value === "male" || value === "female";
}

function buildAssignments(schedule: SchedulePackageRow): SchedulePackageAssignment[] {
  return (schedule.assignments ?? [])
    .filter((assignment) => isGender(assignment.gender) && assignment.department && assignment.combination)
    .map((assignment) => ({
      departmentName: assignment.department!.name,
      gender: assignment.gender!,
      combinationName: assignment.combination!.name,
      imageUrl: assignment.combination!.preview_status === "ready"
        ? pickAssignmentAsset({
            gender: assignment.gender,
            combination: assignment.combination,
          })
        : null,
    }));
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ scheduleId: string }> },
) {
  const { scheduleId } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code")?.trim();
  if (!code) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from("schedules")
    .select(`
      id, branch_id, service_date, title, notes,
      branch:branches(id, name, view_code),
      assignments:schedule_assignments(
        id, gender,
        department:departments(name),
        combination:combinations(name, preview_status, male_composite_url, female_composite_url, male_gif_url, female_gif_url)
      )
    `)
    .eq("id", scheduleId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
  }

  const schedule = data as SchedulePackageRow;
  if (!schedule.branch || schedule.branch.view_code !== code) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const branchName = schedule.branch.name;
  const pdf = await createSchedulePackagePdf({
    branchName,
    serviceTitle: schedule.title,
    serviceDate: schedule.service_date,
    notes: schedule.notes,
    publicScheduleUrl: new URL(`/view/${schedule.branch.view_code}`, req.url).toString(),
    assignments: buildAssignments(schedule),
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
      "Cache-Control": "public, max-age=120",
    },
  });
}
