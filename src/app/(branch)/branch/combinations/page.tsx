import type { Metadata } from "next";
import CombinationsPageClient from "@/components/branch/CombinationsPageClient";

export const metadata: Metadata = { title: "Combinations | Garment" };

export default function CombinationsPage() {
  return <CombinationsPageClient />;
}
