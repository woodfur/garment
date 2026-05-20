import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";

export default async function HomePage() {
  const auth = await getAuthContext();

  if (!auth) redirect("/auth/login");

  if (auth.role === "super_admin") redirect("/admin/dashboard");

  // Branch leader — check must_change_password to skip double redirect
  if (auth.mustChangePassword) redirect("/branch/change-password");

  redirect("/branch/dashboard");
}
