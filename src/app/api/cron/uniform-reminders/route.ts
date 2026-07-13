import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  buildUniformReminderPayload,
  getReminderTargetDate,
  type ReminderAssignment,
} from "@/lib/uniform-reminders";

type DeliveryInsert = {
  branch_id: string;
  schedule_id: string;
  target_service_date: string;
  reminder_kind: "wednesday" | "sunday";
  delivery_status: "sent" | "failed";
  zapier_response_status: number | null;
  error_message: string | null;
  sent_at: string | null;
};

type DeliveryQuery = {
  upsert: (
    values: DeliveryInsert,
    options: { onConflict: string }
  ) => Promise<{ error: { message: string } | null }>;
  select: (columns: string) => {
    eq: (column: string, value: string) => {
      eq: (column: string, value: string) => {
        in: (
          column: string,
          values: string[]
        ) => Promise<{ data: Array<{ schedule_id: string }> | null; error: { message: string } | null }>;
      };
    };
  };
};

type DeliveryDb = {
  from: (table: "uniform_reminder_deliveries") => DeliveryQuery;
};

type ScheduleRow = {
  id: string;
  branch_id: string;
  service_date: string;
  title: string;
  branch: { id: string; name: string; view_code: string } | null;
  assignments: Array<{
    id: string;
    department: { id: string; name: string } | null;
    combination: { id: string; name: string; preview_status: string } | null;
  }>;
};

function siteUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!value) return null;
  return value.replace(/\/+$/, "");
}

async function recordDelivery({
  db,
  schedule,
  reminderKind,
  status,
  zapierResponseStatus,
  errorMessage,
}: {
  db: DeliveryDb;
  schedule: ScheduleRow;
  reminderKind: "wednesday" | "sunday";
  status: "sent" | "failed";
  zapierResponseStatus: number | null;
  errorMessage: string | null;
}) {
  await db.from("uniform_reminder_deliveries").upsert(
    {
      branch_id: schedule.branch_id,
      schedule_id: schedule.id,
      target_service_date: schedule.service_date,
      reminder_kind: reminderKind,
      delivery_status: status,
      zapier_response_status: zapierResponseStatus,
      error_message: errorMessage,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    },
    { onConflict: "branch_id,schedule_id,reminder_kind" }
  );
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[uniform-reminders] CRON_SECRET is not configured");
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.ZAPIER_UNIFORM_REMINDER_WEBHOOK_URL?.trim();
  const publicSiteUrl = siteUrl();
  if (!webhookUrl || !publicSiteUrl) {
    console.error("[uniform-reminders] Missing reminder environment variables");
    return NextResponse.json(
      { error: "ZAPIER_UNIFORM_REMINDER_WEBHOOK_URL and NEXT_PUBLIC_SITE_URL are required" },
      { status: 500 }
    );
  }

  const target = getReminderTargetDate();
  if (!target) {
    return NextResponse.json({ skipped: true, reason: "No reminder target for today" });
  }

  const admin = createAdminClient();
  const deliveryDb = admin as unknown as DeliveryDb;

  const { data: schedules, error: schedulesError } = await admin
    .from("schedules")
    .select(
      `
      id,
      branch_id,
      service_date,
      title,
      branch:branches(id, name, view_code),
      assignments:schedule_assignments(
        id,
        department:departments(id, name),
        combination:combinations(id, name, preview_status)
      )
    `
    )
    .eq("service_date", target.targetDate);

  if (schedulesError) {
    console.error("[uniform-reminders] Failed to load schedules:", schedulesError);
    return NextResponse.json({ error: schedulesError.message }, { status: 500 });
  }

  const typedSchedules = (schedules ?? []) as ScheduleRow[];
  if (typedSchedules.length === 0) {
    return NextResponse.json({
      reminderKind: target.reminderKind,
      targetDate: target.targetDate,
      sent: 0,
      failed: 0,
      skipped: 0,
    });
  }

  const scheduleIds = typedSchedules.map((schedule) => schedule.id);
  const { data: existingSent, error: sentError } = await deliveryDb
    .from("uniform_reminder_deliveries")
    .select("schedule_id")
    .eq("reminder_kind", target.reminderKind)
    .eq("delivery_status", "sent")
    .in("schedule_id", scheduleIds);

  if (sentError) {
    console.error("[uniform-reminders] Failed to load delivery state:", sentError);
    return NextResponse.json({ error: sentError.message }, { status: 500 });
  }

  const alreadySent = new Set((existingSent ?? []).map((row: { schedule_id: string }) => row.schedule_id));
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const schedule of typedSchedules) {
    if (alreadySent.has(schedule.id)) {
      skipped += 1;
      continue;
    }

    if (!schedule.branch?.view_code) {
      await recordDelivery({
        db: deliveryDb,
        schedule,
        reminderKind: target.reminderKind,
        status: "failed",
        zapierResponseStatus: null,
        errorMessage: "Branch view code is missing",
      });
      failed += 1;
      continue;
    }

    const assignments: ReminderAssignment[] = (schedule.assignments ?? []).map((assignment) => ({
      departmentName: assignment.department?.name ?? "Unknown department",
      combinationName: assignment.combination?.name ?? null,
      previewStatus: assignment.combination?.preview_status ?? null,
    }));

    const payload = buildUniformReminderPayload({
      branchName: schedule.branch.name,
      serviceTitle: schedule.title,
      serviceDate: schedule.service_date,
      reminderKind: target.reminderKind,
      publicScheduleUrl: `${publicSiteUrl}/view/${schedule.branch.view_code}`,
      assignments,
    });

    try {
      const zapierResponse = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!zapierResponse.ok) {
        const responseText = await zapierResponse.text().catch(() => "");
        throw new Error(
          `Zapier responded with ${zapierResponse.status}${responseText ? `: ${responseText.slice(0, 300)}` : ""}`
        );
      }

      await recordDelivery({
        db: deliveryDb,
        schedule,
        reminderKind: target.reminderKind,
        status: "sent",
        zapierResponseStatus: zapierResponse.status,
        errorMessage: null,
      });
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Zapier delivery error";
      console.error(`[uniform-reminders] Zapier delivery failed for schedule ${schedule.id}:`, message);
      await recordDelivery({
        db: deliveryDb,
        schedule,
        reminderKind: target.reminderKind,
        status: "failed",
        zapierResponseStatus: null,
        errorMessage: message,
      });
      failed += 1;
    }
  }

  return NextResponse.json({
    reminderKind: target.reminderKind,
    targetDate: target.targetDate,
    sent,
    failed,
    skipped,
  });
}
