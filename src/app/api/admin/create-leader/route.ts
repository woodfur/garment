import { NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

/** Bias-free password generation using rejection sampling */
function generatePassword(): string {
  const upper   = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // excludes I, O
  const lower   = "abcdefghjkmnpqrstuvwxyz";  // excludes i, l, o
  const digits  = "23456789";                 // excludes 0, 1
  const special = "!@#$%";
  const all = upper + lower + digits + special;

  function secureRandom(max: number): number {
    const limit = 256 - (256 % max);
    let val: number;
    do {
      val = crypto.getRandomValues(new Uint8Array(1))[0];
    } while (val >= limit);
    return val % max;
  }

  const rand = (chars: string) => chars[secureRandom(chars.length)];

  // Guarantee at least one from each character class
  const parts = [
    rand(upper), rand(lower), rand(digits), rand(special),
    ...Array.from({ length: 8 }, () => rand(all)),
  ];

  // Fisher-Yates shuffle — unbiased
  for (let i = parts.length - 1; i > 0; i--) {
    const j = secureRandom(i + 1);
    [parts[i], parts[j]] = [parts[j], parts[i]];
  }

  return parts.join(""); // 12 characters
}

export async function POST(request: Request) {
  try {
    const { email, fullName, branchId } = await request.json();

    if (!email || !branchId) {
      return NextResponse.json({ error: "Email and branch are required" }, { status: 400 });
    }

    // Authenticate caller — getUser() verifies the JWT against Supabase Auth server
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const meta = user.app_metadata as Record<string, string> | undefined;
    let callerRole = meta?.user_role;

    if (!callerRole) {
      const admin = createAdminClient();
      const { data: profile } = await admin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      callerRole = (profile as { role: string } | null)?.role;
    }

    if (callerRole !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const adminSupabase = createAdminClient();

    // Step 1: Validate branch exists BEFORE creating the user
    const { data: branch } = await adminSupabase
      .from("branches")
      .select("id, name")
      .eq("id", branchId)
      .single() as unknown as { data: { id: string; name: string } | null };

    if (!branch) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }

    // Step 2: Generate secure password
    const password = generatePassword();

    // Step 3: Create auth user (email pre-confirmed — no SMTP needed)
    const createResult = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName || "",
        role: "branch_leader",
        branch_id: branchId,
      },
    });

    if (createResult.error) {
      const msg = createResult.error.message;
      if (msg.toLowerCase().includes("already registered") || msg.toLowerCase().includes("already exists")) {
        return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    // Guard: null check on response
    if (!createResult.data.user) {
      return NextResponse.json({ error: "User creation failed unexpectedly" }, { status: 500 });
    }

    const newUserId = createResult.data.user.id;

    // Step 4: Upsert profile with must_change_password: true
    const { error: profileError } = await (adminSupabase as any)
      .from("profiles")
      .upsert({
        id: newUserId,
        email,
        full_name: fullName || null,
        role: "branch_leader",
        branch_id: branchId,
        avatar_url: null,
        must_change_password: true,
      }) as { error: Error | null };

    if (profileError) {
      // Rollback: delete auth user to prevent orphaned account
      await adminSupabase.auth.admin.deleteUser(newUserId);
      console.error("Profile upsert failed, rolled back auth user:", profileError);
      return NextResponse.json({ error: "Failed to create account. Please try again." }, { status: 500 });
    }

    // Return credentials — password is shown once and never stored
    return NextResponse.json({ email, password });
  } catch (err) {
    console.error("Create leader error:", err);
    return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
  }
}
