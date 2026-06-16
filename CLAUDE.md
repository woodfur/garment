# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Next.js 16 + React 19 + Turbopack.** This is a newer Next.js than most training data. `AGENTS.md` (included above) requires reading the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code. Notable local conventions: middleware lives in `src/proxy.ts` (exported as `proxy`, not `middleware`), and the React Compiler is enabled (`reactCompiler: true`) — do not hand-add `useMemo`/`useCallback` for things the compiler already memoizes.

## Commands

```bash
npm run dev      # Next dev server (Turbopack) on :3000
npm run build    # Production build
npm run start    # Serve production build
npm run lint     # ESLint (eslint-config-next)
```

There is **no test suite** and no typecheck script — rely on `npm run build` (or your editor's TS server) to catch type errors. Fixes in git history are tracked as "cycle N" / "GAP-N" — these are audit-driven hardening passes, not test runs.

## What this is

**Garment** is an internal tool for a multi-branch church organization to manage uniforms and generate AI previews of uniform combinations on mannequins. The flow: a branch leader uploads garment images → assigns them to body **zones** → the app composites them onto a base mannequin via Replicate AI → produces per-gender preview images and animated GIFs → publishes a read-only schedule viewable by congregation members through a shareable code.

## Roles & route groups

Three distinct audiences, enforced by `src/proxy.ts` and per-area auth guards:

| Route group | Audience | Auth mechanism |
|---|---|---|
| `(admin)` → `/admin/*` | `super_admin` | Supabase session cookie |
| `(branch)` → `/branch/*` | `branch_leader` | Supabase session cookie |
| `(branch-auth)` → `/branch/change-password` | branch leader forced password reset (`must_change_password`) | Supabase session |
| `(auth)` → `/auth/login` | login | — |
| `/view/[code]` | public congregation viewers | `polar_branch_session` cookie (a separate, code-based session — **not** Supabase) |

`proxy.ts` only checks for **cookie presence** (fast, no network call) — real authorization happens in Server Components via `getAuthContext()` and in API routes via the guards below. Two independent auth systems coexist: Supabase auth for staff, and a lightweight code-based viewer session for the public `/view` pages.

## Auth architecture (`src/lib/`)

- **`auth.ts` — `getAuthContext()`**: the canonical "who is this user" call for **Server Components only**. Two-layer cached: `React.cache()` dedupes within one render; `unstable_cache` persists the `profiles` lookup for 60s across requests. `supabase.auth.getUser()` is deliberately *not* cached (JWT must validate every request). Returns `null` when unauthenticated.
- **`api-auth.ts` — `requireBranchLeader()` / `requireSuperAdmin()`**: the guard every API route must call first. They return either an auth context or a `NextResponse` error — call site pattern is `const r = await requireX(); if (r instanceof NextResponse) return r;`.
- **`supabase/server.ts`**: `createClient()` (async, cookie-bound, RLS-enforced — for user-scoped reads) vs **`createAdminClient()` (synchronous singleton, service-role, bypasses RLS)**. The sync-ness is load-bearing: call sites do `createAdminClient()` without `await`, and `as any` casts would hide the resulting bug — **do not make it async**.
- **`supabase/client.ts`**: browser client for Client Components.

## The AI compositing pipeline (`src/lib/replicate.ts`)

This is the most intricate part of the system. A combination's preview is built by **chaining** Replicate predictions — each garment is composited onto the result of the previous step (IDM-VTON virtual try-on), in `ZONE_LAYER_ORDER` (from `src/types/zones.ts`), then the final image is animated to a GIF (Stable Video Diffusion).

Key design points:
- **Prod vs dev continuation differ.** In production (`IS_PROD` = `NODE_ENV==='production'` *and* `NEXT_PUBLIC_APP_URL` set), each step registers a **webhook** (`/api/webhooks/replicate`) that fires the next step. In dev, a fire-and-forget **polling loop** (`pollAndContinueChain`) drives the chain. Both paths must stay behaviorally in sync — past bugs came from a guard existing in one path but not the other.
- **State lives in the DB, not memory.** Each step inserts a `replicate_jobs` row; the webhook re-fetches ordered zone items from the DB rather than trusting passed-in state. Completion is tracked by writing `male_composite_url`/`female_composite_url` then `male_gif_url`/`female_gif_url` on `combinations`, and `checkAndMarkReady()` flips `preview_status` to `ready` only once every gender that *has* zone items has its GIF.
- **Model IDs are pinned to explicit version hashes** with comments explaining why (`predictions.create()` needs a version hash; `:latest` only works with `replicate.run()`). Treat the `MODELS` map and input schemas as fragile external contracts — changing a model means re-checking its input schema.
- `replicate_jobs` exists in the database but **not** in the generated `Database` types, hence the `const db = admin as any` casts throughout this file.

## Body zones (`src/types/zones.ts`)

The domain's core abstraction. A mannequin body is divided into `BodyZone`s (head, top, outer, bottom, footwear, plus six accessory slots). Each combination assigns one uniform per zone per gender (`combination_zone_items`). Three constants govern behavior:
- `ZONE_LAYER_ORDER` — compositing order (innermost → outermost); the pipeline iterates this.
- `ZONE_POSITIONS` — x/y hotspot coordinates (as % of image) for the interactive editor; comment notes these are estimates needing calibration against real generated images.
- `ZONE_CATEGORIES` — maps a zone to a uniform category; `zoneToCategory()` in `replicate.ts` separately maps zones to the IDM-VTON `upper_body`/`lower_body`/`dresses` enum.

## Database

Single Supabase Postgres. Generated types in `src/types/database.ts` (`Database` interface) — **but it can lag the real schema** (e.g. `replicate_jobs` is missing). When a table isn't in the types, the codebase casts `admin as any`; prefer regenerating types over piling on casts when practical. Core tables: `branches`, `profiles`, `invitations`, `departments`/`department_members`, `uniforms`, `combinations`/`combination_zone_items`, `schedules`/`schedule_assignments`, `inventory_items`/`inventory_transactions`, `replicate_jobs`, `announcements`, `audit_logs`.

## Environment variables

Required (see `.env` / `.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public Supabase client
- `SUPABASE_SERVICE_ROLE_KEY` — service-role (admin client; server-only)
- `REPLICATE_API_KEY`, `REPLICATE_WEBHOOK_SECRET` — AI pipeline + webhook verification
- `NEXT_PUBLIC_APP_URL` — required in prod for webhook callback URLs (gates `IS_PROD`)
- `NEXT_PUBLIC_MANNEQUIN_MALE_URL`, `NEXT_PUBLIC_MANNEQUIN_FEMALE_URL` — base mannequin images the pipeline composites onto

> **Gotcha:** the Supabase project ref is hardcoded in two places — the cookie name in `src/proxy.ts` (`sb-<ref>-auth-token`) and the `NEXT_PUBLIC_SUPABASE_URL`. If you point at a different Supabase project, **update both**, or the proxy's auth-cookie check will silently never match.

## Conventions

- **Styling is inline CSS-in-JS** using CSS custom properties (`var(--color-...)`, `var(--radius-...)`, `var(--font-...)`) — not Tailwind utility classes in markup, despite Tailwind v4 being installed. Match the existing inline-style pattern when editing pages.
- API route handlers always guard auth first (see `api-auth.ts` pattern), then operate via the appropriate Supabase client (user-scoped vs admin).
- `@/` is the path alias for `src/`.
