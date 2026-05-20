import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/setup
 * One-time route to create the super admin account.
 * Disable or remove after first use.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }

  // Safety check — only allow in development or if no super admin exists yet
  const supabase = createAdminClient();

  const { data: existingAdmin } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "super_admin")
    .maybeSingle();

  if (existingAdmin) {
    return NextResponse.json({ error: "Super admin already exists" }, { status: 409 });
  }

  const { email, password, fullName } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: "super_admin",
      full_name: fullName || "Super Admin",
    },
  });

  if (createError) {
    return NextResponse.json({ error: createError.message }, { status: 500 });
  }

  // Upsert profile with super_admin role
  await (supabase as any).from("profiles").upsert({
    id: authUser.user.id,
    email,
    full_name: fullName || "Super Admin",
    role: "super_admin",
    branch_id: null,
  });

  return NextResponse.json({ success: true, userId: authUser.user.id });
}
