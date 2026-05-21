import type { Metadata } from "next";
import DepartmentsPageClient from "@/components/branch/DepartmentsPageClient";

export const metadata: Metadata = { title: "Departments | Garment" };

export default function DepartmentsPage() {
  return <DepartmentsPageClient />;
}
