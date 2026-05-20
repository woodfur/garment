import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";

export default async function HomePage() {
  const auth = await getAuthContext();

  if (!auth) redirect("/auth/login");
  if (auth.role === "super_admin") redirect("/admin/dashboard");

  redirect("/branch/dashboard");
}
