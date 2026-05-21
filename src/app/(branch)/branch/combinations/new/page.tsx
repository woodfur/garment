import type { Metadata } from "next";
import CombinationBuilderClient from "@/components/branch/CombinationBuilderClient";

export const metadata: Metadata = { title: "Build Combination | Garment" };

export default function NewCombinationPage() {
  return <CombinationBuilderClient />;
}
