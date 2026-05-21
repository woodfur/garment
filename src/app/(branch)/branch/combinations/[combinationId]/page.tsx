import type { Metadata } from "next";
import CombinationDetailClient from "@/components/branch/CombinationDetailClient";

export const metadata: Metadata = { title: "Combination Detail | Garment" };

export default async function CombinationDetailPage({
  params,
}: {
  params: Promise<{ combinationId: string }>;
}) {
  const { combinationId } = await params;
  return <CombinationDetailClient combinationId={combinationId} />;
}
