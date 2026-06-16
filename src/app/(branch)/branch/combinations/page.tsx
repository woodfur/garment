import { redirect } from "next/navigation";

// The Wardrobe (/branch/uniforms) now holds both finished looks and pieces,
// so the old combinations list redirects there. Detail pages
// (/branch/combinations/[id]) and the builder (/new) still live under this route.
export default function CombinationsPage() {
  redirect("/branch/uniforms");
}
