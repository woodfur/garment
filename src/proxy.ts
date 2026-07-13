import { NextResponse, type NextRequest } from "next/server";

// Supabase stores session in this cookie (project-ref based)
// Reading it directly avoids any network call — proxy stays <1ms
const SUPABASE_COOKIE = "sb-cjunbvhrqvfagxwgpwmo-auth-token";

function isAuthenticated(request: NextRequest): boolean {
  // Check both the main token cookie and the legacy/chunked variants
  const token =
    request.cookies.get(SUPABASE_COOKIE)?.value ||
    request.cookies.get(`${SUPABASE_COOKIE}.0`)?.value ||
    request.cookies.get(`${SUPABASE_COOKIE}-code-verifier`)?.value;
  return !!token;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Admin routes: must be authenticated ───────────────────────────────────
  if (pathname.startsWith("/admin")) {
    if (!isAuthenticated(request)) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
  }

  // ── Branch routes: must be authenticated ──────────────────────────────────
  if (pathname.startsWith("/branch")) {
    if (!isAuthenticated(request)) {
      return NextResponse.redirect(new URL("/auth/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
