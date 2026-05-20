import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";

// Guards: session required + must_change_password must be false.
// The change-password page is in (branch-auth) route group, NOT here,
// so no pathname exclusion is needed — no infinite redirect risk.
export default async function BranchLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuthContext();

  if (!auth) redirect("/auth/login");
  if (auth.mustChangePassword) redirect("/branch/change-password");

  return <>{children}</>;
}
