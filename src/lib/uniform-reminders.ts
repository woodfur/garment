export type ReminderKind = "wednesday" | "sunday";

export type ReminderTarget = {
  reminderKind: ReminderKind;
  targetDate: string;
};

export type ReminderAssignment = {
  departmentName: string;
  combinationName: string | null;
  previewStatus: string | null;
};

export type UniformReminderInput = {
  serviceTitle: string;
  serviceDate: string;
  publicScheduleUrl: string;
  assignments: ReminderAssignment[];
};

export type UniformReminderPayloadInput = UniformReminderInput & {
  branchName: string;
  reminderKind: ReminderKind;
};

export type UniformReminderPayload = UniformReminderPayloadInput & {
  leaderMessage: string;
};

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function utcDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

export function getReminderTargetDate(now: Date = new Date()): ReminderTarget | null {
  const day = now.getUTCDay();

  if (day === 1) {
    return { reminderKind: "wednesday", targetDate: utcDateString(addDays(now, 2)) };
  }

  if (day === 4) {
    return { reminderKind: "sunday", targetDate: utcDateString(addDays(now, 3)) };
  }

  return null;
}

function formatServiceDate(serviceDate: string): string {
  return new Date(`${serviceDate}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function assignmentLine(label: "Choir" | "Ushers", assignments: ReminderAssignment[]): string {
  const assignment = assignments.find(
    (item) => item.departmentName.trim().toLowerCase() === label.toLowerCase()
  );

  if (!assignment?.combinationName) {
    return `${label}: Not assigned yet`;
  }

  const previewNote =
    assignment.previewStatus && assignment.previewStatus !== "ready"
      ? ` (preview ${assignment.previewStatus})`
      : "";

  return `${label}: ${assignment.combinationName}${previewNote}`;
}

export function buildUniformReminderMessage(input: UniformReminderInput): string {
  const formattedDate = formatServiceDate(input.serviceDate);
  const lines = [
    `Uniform reminder for ${input.serviceTitle} - ${formattedDate}`,
    "",
    assignmentLine("Choir", input.assignments),
    assignmentLine("Ushers", input.assignments),
    "",
    "Full preview:",
    input.publicScheduleUrl,
    "",
    "Please forward this to the Choir and Ushers WhatsApp groups.",
  ];

  return lines.join("\n");
}

export function buildUniformReminderPayload(
  input: UniformReminderPayloadInput
): UniformReminderPayload {
  return {
    ...input,
    leaderMessage: buildUniformReminderMessage(input),
  };
}
