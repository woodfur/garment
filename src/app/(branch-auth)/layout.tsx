import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Session-only guard — no must_change_password check.
// The change-password page lives here to avoid the Server Component pathname problem.
export default async function BranchAuthLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) redirect("/auth/login");
  return <>{children}</>;
}
