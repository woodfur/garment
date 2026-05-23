import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// GAP-2 FIX: Use getUser() (server-verified JWT) instead of getSession() (cookie-only, unverified).
// The change-password page lives here to avoid the Server Component pathname problem.
export default async function BranchAuthLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");
  return <>{children}</>;
}
