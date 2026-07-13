import type { Metadata } from "next";
import PaletteComposeClient from "@/components/branch/PaletteComposeClient";

export const metadata: Metadata = { title: "Compose Palette Look | Garment" };

export default function NewPaletteCombinationPage() {
  return <PaletteComposeClient />;
}
