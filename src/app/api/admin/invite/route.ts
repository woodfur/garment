import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";
import { revalidateTag } from "next/cache";

export async function POST(request: Request) {
  try {
    const { email, fullName, branchId } = await request.json();

    if (!email || !branchId) {
      return NextResponse.json({ error: "Email and branch are required" }, { status: 400 });
    }

    // Verify caller is authenticated and is super_admin
    // Fast path: JWT claims (requires Supabase hook to be registered + re-login)
    // Fallback: DB query for sessions predating the JWT hook
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const meta = session.user.app_metadata as Record<string, string> | undefined;
    let callerRole = meta?.user_role;

    if (!callerRole) {
      // JWT hook not active yet — fall back to DB
      const admin = createAdminClient();
      const { data: profile } = await admin
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .single();
      callerRole = (profile as { role: string } | null)?.role;
    }

    const callerId = session.user.id;

    if (callerRole !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const adminSupabase = createAdminClient();

    // Verify branch exists
    const { data: branch } = (await adminSupabase
      .from("branches").select("id, name").eq("id", branchId).single()) as unknown as { data: { id: string; name: string } | null };
    if (!branch) return NextResponse.json({ error: "Branch not found" }, { status: 404 });

    // Record invitation
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    await (adminSupabase as unknown as { from: (t: string) => { insert: (d: unknown) => Promise<unknown> } })
      .from("invitations").insert({
        email,
        branch_id: branchId,
        role: "branch_leader",
        status: "pending",
        expires_at: expiresAt,
        created_by: callerId,
      });

    // Send Supabase Auth invitation email
    const { error: inviteError } = await adminSupabase.auth.admin.inviteUserByEmail(email, {
      data: {
        role: "branch_leader",
        branch_id: branchId,
        full_name: fullName || "",
      },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/branch/dashboard`,
    });

    if (inviteError) {
      // Don't fail if user already exists — the invitation record is still saved
      if (!inviteError.message.includes("already registered")) {
        console.error("Invite error:", inviteError);
        return NextResponse.json({ error: inviteError.message }, { status: 500 });
      }
    }

    // Invalidate branch detail cache so invitation history updates immediately
    revalidateTag(`branch-${branchId}`, "default");

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Invite route error:", err);
    return NextResponse.json({ error: "Failed to send invitation" }, { status: 500 });
  }
}
