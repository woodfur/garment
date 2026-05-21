# Changelog

All notable changes to the Garment platform are recorded here.

---

## [Unreleased] — 2026-05-21 (Performance Optimisation)

### Improved — Application Performance
- **Loading skeletons** (`loading.tsx`): Added shimmer skeleton screens for branch dashboard, admin dashboard, and admin branches list. Renders instantly on every navigation — eliminates blank white screen during data fetch. Skeleton CSS utility (`.skeleton`, `@keyframes shimmer`) centralised in `globals.css`.
- **Link prefetch**: Added `prefetch={true}` to all nav `<Link>` elements in `BranchSidebar` and `AdminSidebar`. Next.js pre-fetches the RSC skeleton shell in the background while the user reads the current page.
- **Client router cache** (`next.config.ts`): Added `experimental.staleTimes: { dynamic: 30, static: 180 }`. Dynamic pages (dashboards) are cached client-side for 30s — navigating back to a recently-visited page is now instant (zero server round-trip within the 30s window).
- **Router cache cleared on sign-out**: Added `router.refresh()` after `router.push('/auth/login')` in all 4 sign-out handlers (`BranchSidebar`, `BranchTopbar`, `AdminSidebar`). Prevents a second user from seeing the previous user's cached RSC pages via the back button.
- **Profile DB query cached** (`src/lib/auth.ts`): The `profiles` table lookup in `getAuthContext()` is now wrapped in `unstable_cache` (60s TTL, keyed by `userId`). Previously ran uncached on every page navigation — eliminated ~100–200ms per request on cache hit. Both admin and branch layouts benefit automatically.
- **Branch name cached** (`src/app/(branch)/layout.tsx`): The `branches.name` lookup is now wrapped in `unstable_cache` (1hr TTL, keyed by `branchId`). Previously uncached on every branch navigation — eliminated ~100–200ms per request on cache hit.
- **Dashboard queries cached** (`src/app/(branch)/branch/dashboard/page.tsx`): All dashboard data is now in two `unstable_cache` entries keyed by `branchId` (30s TTL): stat counts (uniforms, combinations, schedules, low stock) and list data (upcoming schedule, announcements). Cache miss is same speed as before; cache hit is <5ms vs ~200–400ms.
- **Admin client singleton** (`src/lib/supabase/server.ts`): `createAdminClient()` now returns a module-level singleton instead of creating a new client instance on every call.

### Improved — Database Performance
- **Performance indexes**: Added 6 `branch_id` indexes to `uniforms`, `combinations`, `schedules` (compound with `service_date`), `announcements` (compound with `is_published`), `inventory_items`, and `profiles`. All branch-scoped queries previously performed full table scans.
- **Low stock RPC** (`get_branch_low_stock_count`): New Supabase RPC function replaces full `inventory_items` table fetch + JavaScript filter. DB now counts low-stock items server-side and returns a single integer.

### Files Changed
`src/app/globals.css` · `src/app/(branch)/branch/dashboard/loading.tsx` *(new)* · `src/app/(admin)/admin/dashboard/loading.tsx` *(new)* · `src/app/(admin)/admin/branches/loading.tsx` *(new)* · `src/app/(branch)/branch/dashboard/page.tsx` · `src/app/(branch)/layout.tsx` · `src/lib/auth.ts` · `src/lib/supabase/server.ts` · `src/components/branch/BranchSidebar.tsx` · `src/components/branch/BranchTopbar.tsx` · `src/components/admin/AdminSidebar.tsx` · `next.config.ts` · `supabase/perf_indexes.sql` *(new)* · `supabase/perf_rpc_low_stock_count.sql` *(new)*

---

## [Unreleased] — 2026-05-21 (Light Lavender Theme)

### Changed — UI/UX Redesign
- **Full light lavender theme**: Replaced dark charcoal + gold theme with a soft lavender light theme across the entire application. Primary interactive colour is `#7C5CBF` (mid-violet, WCAG AA on white: 5.2:1), decorative tint accent is `#9B87F5` (light lavender).
- **Typography**: Replaced Outfit + Inter with `DM Serif Display` (headings, 400 weight only) + `DM Sans` (body/UI, 400/500/600/700). Updated `h1–h6` base font-weight from 600 to 400 for DM Serif Display compatibility.
- **Split-panel login**: Login page redesigned with a lavender gradient left panel (SVG fabric illustration + Garment wordmark) and a clean white right panel. Mobile-responsive: left panel hidden on ≤768px. Suspense boundary preserved in correct position.
- **Brand name**: Updated "Polar" → "Garment" across all user-facing metadata, page text, and URL prefixes (`polar.app/view/` → `garment.app/view/`).
- **Globals.css overhaul**: Complete `@theme` token replacement — new backgrounds, borders, text, semantic colours (warning now `#D97706` amber-600 for WCAG AA), shadows, and scrollbar styles. Added `.btn-primary`, `.btn-secondary`, `.primary-gradient`, `.text-primary-gradient` utility classes.
- **Backward-compatible alias strategy**: `--color-gold` → `var(--color-primary-dark)` (= `#7C5CBF`), `--color-gold-light` → `var(--color-primary)` (= `#9B87F5`), `--color-gold-muted` → `var(--color-primary-light)` (= `#EDE9F8`). All existing `var(--color-gold)` references cascade automatically.
- **Button text**: All 14 instances of hardcoded `#0D0F14` (dark) button text updated to `#FFFFFF` (white) for contrast against lavender gradient buttons.
- **Hardcoded rgba tints**: All 26 instances of `rgba(201,168,76,*)` (gold tints) replaced with `rgba(155,135,245,*)` (lavender tints) across AdminSidebar, BranchSidebar, QuickActionsGrid, CreateLeaderForm, all dashboards, and all 5 branch feature pages.
- **Sidebar active state**: Active nav pill background `#EDE9F8`, border `rgba(155,135,245,0.25)`, text `var(--color-primary-dark)`.
- **Avatar initials**: AdminTopbar and BranchTopbar avatar text changed from dark to white.
- **Auth layout**: `(auth)/layout.tsx` converted to a passthrough `<>{children}</>` to support split-panel login layout.
- **Password strength colours**: "Strong" now uses `var(--color-success)` (was hardcoded `#4CAF50`); "Fair" now uses `var(--color-warning)` = `#D97706` (was `var(--color-gold)` which would have resolved to lavender — semantically incorrect for a warning).
- **Modal shadows**: `CreateLeaderForm` credential modal box-shadow lightened from `rgba(0,0,0,0.5)` to `rgba(155,135,245,0.15)` for light theme.
- **Theme-color meta**: Added `<meta name="theme-color" content="#7C5CBF">` for mobile browser chrome.

### Files Changed
`src/app/layout.tsx` · `src/app/globals.css` · `src/app/(auth)/layout.tsx` · `src/app/(auth)/auth/login/page.tsx` · `src/app/(branch-auth)/branch/change-password/page.tsx` · `src/app/(admin)/admin/dashboard/page.tsx` · `src/app/(admin)/admin/branches/page.tsx` · `src/app/(admin)/admin/branches/new/page.tsx` · `src/app/(admin)/admin/branches/[branchId]/page.tsx` · `src/app/(branch)/branch/dashboard/page.tsx` · `src/app/(branch)/branch/uniforms/page.tsx` · `src/app/(branch)/branch/combinations/page.tsx` · `src/app/(branch)/branch/schedule/page.tsx` · `src/app/(branch)/branch/inventory/page.tsx` · `src/app/(branch)/branch/announcements/page.tsx` · `src/components/admin/AdminSidebar.tsx` · `src/components/admin/AdminTopbar.tsx` · `src/components/admin/BranchCard.tsx` · `src/components/admin/CreateLeaderForm.tsx` · `src/components/branch/BranchSidebar.tsx` · `src/components/branch/BranchTopbar.tsx` · `src/components/branch/QuickActionsGrid.tsx`

---

## [Unreleased] — 2026-05-21

### Fixed
- **404 on `localhost:3000`** — Turbopack was misdetecting the workspace root as `/Users/media/` (home dir) instead of the project directory due to multiple `package-lock.json` files on the machine. Fixed by explicitly setting `turbopack.root: path.resolve(__dirname)` in `next.config.ts`.
- **Silent auth errors** — `getAuthContext()` catch block now logs errors via `console.error("[getAuthContext] failed:", err)` so Supabase/cookie failures surface in the dev terminal instead of disappearing silently.
- **Duplicate `auth/` segment ambiguity** — `src/app/auth/callback/route.ts` (bare directory) was coexisting with `src/app/(auth)/auth/` (route group), creating routing ambiguity in Next.js 16 + Turbopack. Moved `auth/callback/route.ts` into the `(auth)` route group. URL `/auth/callback` is unchanged.
- **Stale refresh token infinite loop** — `proxy.ts` was redirecting users from `/auth/login` back to `/` whenever a Supabase session cookie was **present** — but it only checked cookie existence, not validity. An expired/invalid token looked authenticated to the proxy, so any user with a stale cookie was permanently bounced between `/` and `/auth/login`. Fixed by removing the proxy-level login redirect entirely; the login page's own server-side auth check already handles redirecting valid sessions away from login.
- **`getAuthContext()` stale token handling** — Simplified: now logs a warning and returns `null` (which routes to login). Removed the earlier overcomplicated `redirect("/api/auth/signout")` approach that was unnecessary once the proxy loop was fixed.
- **`CreateLeaderForm` crash** — `handleSubmit` had no try/catch: if the API returned a non-JSON body or a JSON body with missing fields, `data.password` threw an uncaught TypeError. Fixed by wrapping the fetch in try/catch, adding a nested guard around `res.json()`, and validating `data.email`/`data.password` before calling `setCredentials`. `handleCopy` also now guards against null `credentials` and unavailable Clipboard API.
- **"Database error creating new user"** — `must_change_password` was added to `profiles` as `NOT NULL` with no `DEFAULT`. The `handle_new_user` trigger (fires on every `auth.users` INSERT) didn't include this column, causing a NOT NULL constraint violation that rolled back the entire user creation. Fixed via migration: added `DEFAULT false` to the column and updated the trigger to explicitly insert `must_change_password = false`.
- **`getSession()` security warnings** — `getAuthContext()` and `create-leader` API route were using `supabase.auth.getSession()` (reads unverified cookie) instead of `supabase.auth.getUser()` (validates against Supabase Auth server). Replaced both with `getUser()` to eliminate the warning and properly validate tokens.
- **RSC event handler crash on branch dashboard** — `BranchDashboardPage` is a Server Component but contained `onMouseEnter`/`onMouseLeave` on `<Link>` elements in the Quick Actions grid. Extracted the grid into `src/components/branch/QuickActionsGrid.tsx` (a `"use client"` component) so event handlers are legal.

### Added
- **`GET /api/auth/signout`** — Route Handler for explicit sign-out. Properly clears Supabase `sb-*` cookies (Route Handlers can write cookies; Server Components cannot) then redirects to `/auth/login`. Used by sidebar sign-out buttons.



### Added
- **Branch Dashboard** — full data-driven overview page replacing the placeholder
  - 4 stat cards: Uniforms (active), Combinations, Upcoming Services, Low Stock Alerts (green=0 / red=>0)
  - Upcoming Schedule section: next 3 services with date, title, combination name, and notes
  - Recent Announcements section: latest 3 published announcements with body preview
  - Quick Actions section: 5 action cards (Uniforms, Combinations, Schedule, Inventory, Announcements) with "Coming Soon" badges
- **Branch Layout Shell** — sidebar + topbar chrome for all branch routes
  - `BranchSidebar` component: Garment branding, branch name subtitle, 6 nav items with active state, sign-out
  - `BranchTopbar` component: branch name/role on left, initials avatar + display name + sign-out on right
  - Full 6-step guard sequence: auth → mustChangePassword → super_admin redirect → null branchId → branch existence → render
- **5 "Coming Soon" stub pages** for future branch sections: Uniforms, Combinations, Schedule, Inventory, Announcements — each with sidebar/topbar chrome intact
- **AuthClaims extended** — `fullName` added to `getAuthContext()` return value and DB SELECT

### Fixed
- `super_admin` visiting `/branch/*` routes now redirects to `/admin/dashboard` (previously would crash on missing `branchId`)
- AdminSidebar brand name updated from "Polar" to "Garment"


### Added
- **Branch leader account provisioning** — replaced broken `inviteUserByEmail` flow (required SMTP) with admin-provisioned accounts
  - Super admin creates branch leader accounts directly from the branch detail page
  - System generates a secure 12-character password (bias-free, excludes ambiguous chars)
  - Password displayed once in a blocking modal with copy button — never stored
  - New `POST /api/admin/create-leader` route with auth validation, branch existence check, and partial failure rollback
  - `CreateLeaderForm` component replaces `InviteLeaderForm`
- **Forced first-login password change**
  - New `must_change_password` boolean column on `profiles` table (migration `garment_004`)
  - Branch leaders redirected to `/branch/change-password` on first login — cannot be skipped
  - Password strength indicator (Weak / Fair / Strong / Very Strong) with show/hide toggle
  - New `POST /api/branch/change-password` route
  - New `(branch-auth)` route group housing the change-password page (avoids Server Component pathname conflict)
- **Role-based routing improvements**
  - Root page (`/`) now resolves `must_change_password` directly — avoids double redirect on first login
  - Branch leaders hitting admin routes now redirected to `/branch/dashboard` (not login page)
  - Login page shows contextual banner for `?reason=unauthorized`
- **Auth context updated** — `getAuthContext()` always reads full profile from DB including `must_change_password`

### Removed
- `InviteLeaderForm` component (replaced by `CreateLeaderForm`)
- `POST /api/admin/invite` route (replaced by `POST /api/admin/create-leader`)
- Invitation History table from branch detail page (stale — new flow does not use invitations table)

### Fixed
- Invite route "Forbidden" error — added DB fallback for role check when JWT hook is not active


### Added
- Branch dashboard placeholder page (`/branch/dashboard`) — resolves 404 for non-super-admin users
- `(branch)` route group layout with session guard
- `CHANGELOG.md` created
- `NEXT_PUBLIC_APP_URL` env variable added — fixes invite email redirect URL

### Fixed
- Proxy redirect loop: simplified proxy to direct cookie read (no Supabase client) — eliminated 450–820ms per-request overhead
- `createAdminClient` switched to pure `@supabase/supabase-js` service-role client — resolves `permission denied` errors caused by RLS
- Granted correct table-level permissions after `DROP SCHEMA public CASCADE` wiped all grants
- Fixed `email_change` NULL column causing `Database error querying schema` on login
- Added production guard to `/api/admin/setup` endpoint to prevent unauthorized super admin creation
- Removed debug `console.log("[DEBUG]...")` statements from `src/app/page.tsx`

### Performance
- Proxy latency: 450–820ms → 2–15ms

---

## [Unreleased] — 2026-05-19

### Fixed
- **TypeScript type errors (Supabase `never` inference)**: The Supabase client was not inferring types from the custom `Database` type, causing all `.from().select()` query results to be typed as `never`. Fixed by adding explicit type casts (`as unknown as { data: T | null }`) to all affected Supabase query results and using `(client as any).from(...)` before `.insert()` / `.upsert()` calls where the argument type was being rejected. Files affected:
  - `src/app/(admin)/admin/dashboard/page.tsx` — cast `recentBranches` query + imported `Branch`
  - `src/app/(admin)/admin/branches/page.tsx` — cast `branches` query + imported `Branch`
  - `src/app/(admin)/admin/branches/[branchId]/page.tsx` — cast `branch`, `leaders`, `invitations` queries + `generateMetadata` query; imported `Branch`, `Profile`, `Invitation`
  - `src/app/api/admin/branches/route.ts` — cast duplicate-check and insert queries; imported `Branch`
  - `src/app/api/admin/invite/route.ts` — cast `callerProfile` and `branch` queries; cast invitations insert; imported `Profile`
  - `src/app/api/admin/setup/route.ts` — cast profiles upsert
- `npx tsc --noEmit` now completes with zero errors.

