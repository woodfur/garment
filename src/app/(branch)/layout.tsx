import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function BranchLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) redirect("/auth/login");

  // Both super_admin and branch_leader can access branch routes
  return <>{children}</>;
}
