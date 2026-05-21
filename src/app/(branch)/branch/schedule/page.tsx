import type { Metadata } from "next";
import SchedulePageClient from "@/components/branch/SchedulePageClient";

export const metadata: Metadata = { title: "Schedule | Garment" };

export default function SchedulePage() {
  return <SchedulePageClient />;
}
