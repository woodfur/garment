import type { Metadata } from "next";
import UniformsPageClient from "@/components/branch/UniformsPageClient";

export const metadata: Metadata = { title: "Uniforms | Garment" };

export default function UniformsPage() {
  return <UniformsPageClient />;
}
