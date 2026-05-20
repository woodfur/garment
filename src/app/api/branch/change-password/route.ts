import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { newPassword } = await request.json();

    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Get session — SSR client handles cookie refresh automatically
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Update password — SSR client writes refreshed session tokens back to cookies
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Mark must_change_password = false via admin client (bypasses RLS)
    const admin = createAdminClient();
    const { error: profileError } = await (admin as any)
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", session.user.id) as { error: Error | null };

    if (profileError) {
      console.error("Failed to update must_change_password flag:", profileError);
      // Non-fatal: password was changed, just the flag didn't update.
      // User will be re-prompted on next login, which is acceptable.
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Change password error:", err);
    return NextResponse.json({ error: "Failed to change password" }, { status: 500 });
  }
}
