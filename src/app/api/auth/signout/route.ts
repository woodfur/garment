import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/auth/signout
 *
 * Dedicated sign-out Route Handler. Unlike Server Components, Route Handlers
 * CAN write response cookies, so supabase.auth.signOut() here will correctly
 * clear the sb-* auth cookies via the setAll() handler in server.ts.
 *
 * Usage: redirect("/api/auth/signout") from any Server Component that detects
 * a stale or invalid session — avoids the infinite-loop caused by trying to
 * call signOut() inside a Server Component where cookie writes are silently
 * dropped.
 */
export async function GET() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // After clearing cookies, send the user to the login page.
  return NextResponse.redirect(
    new URL("/auth/login", process.env.NEXT_PUBLIC_APP_URL!)
  );
}
