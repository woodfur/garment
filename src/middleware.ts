import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({ request });

  // ── Build Supabase client (refreshes session cookies) ─────────────────────
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Rate limit view code attempts (simple IP-based) ───────────────────────
  // (Production: use Upstash Redis or similar for accurate rate limiting)

  // ── Route: Admin routes (/admin/*) ────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    if (!user) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
    // Role check: must be super_admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "super_admin") {
      return NextResponse.redirect(new URL("/branch/dashboard", request.url));
    }
  }

  // ── Route: Branch routes (/branch/*) ─────────────────────────────────────
  if (pathname.startsWith("/branch")) {
    if (!user) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "branch_leader" && profile?.role !== "super_admin") {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
  }

  // ── Route: Viewer routes (/view/[branchSlug]) — require session cookie ────
  if (pathname.match(/^\/view\/.+/)) {
    const viewerSession = request.cookies.get("polar_branch_session");
    if (!viewerSession) {
      return NextResponse.redirect(new URL("/view", request.url));
    }
    try {
      const session = JSON.parse(viewerSession.value);
      if (!session.branchId || new Date(session.expiresAt) < new Date()) {
        const redirectResponse = NextResponse.redirect(new URL("/view", request.url));
        redirectResponse.cookies.delete("polar_branch_session");
        return redirectResponse;
      }
    } catch {
      return NextResponse.redirect(new URL("/view", request.url));
    }
  }

  // ── Route: Auth routes — redirect logged-in users ─────────────────────────
  if (pathname.startsWith("/auth/login") && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const dest =
      profile?.role === "super_admin" ? "/admin/dashboard" : "/branch/dashboard";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
