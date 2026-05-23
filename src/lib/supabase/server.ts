import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — cookies can only be set in Server Actions/Route Handlers
          }
        },
      },
    }
  );
}

/**
 * Service-role client — bypasses RLS. Use only in trusted server-side code.
 *
 * IMPORTANT: This function is intentionally SYNCHRONOUS. Do NOT convert it to async.
 * If made async, all call sites (which use `createAdminClient()` without await) will
 * silently receive a Promise instead of a client, causing all `.from()` calls to fail
 * at runtime. The `as any` casts used throughout the codebase would suppress any TS error.
 *
 * The singleton pattern is safe here: the admin client holds no per-user session state.
 */
let _adminClient: ReturnType<typeof createSupabaseClient<Database>> | null = null;

export function createAdminClient() {
  if (!_adminClient) {
    _adminClient = createSupabaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _adminClient;
}
