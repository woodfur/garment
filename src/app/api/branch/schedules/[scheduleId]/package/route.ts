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
        combination:combinations(name, preview_status, male_composite_url, female_composite_url, male_gif_url, female_gif_url)
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

  const pdf = await createSchedulePackagePdf({
    branchName,
    serviceTitle: schedule.title,
    serviceDate: schedule.service_date,
    notes: schedule.notes,
    publicScheduleUrl,
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
      "Cache-Control": "private, max-age=120",
    },
  });
}
