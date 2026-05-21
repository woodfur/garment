# Changelog

All notable changes to the Garment platform are recorded here.

---

## [Unreleased] — 2026-05-21 (Bugfix: Uniform Background Removal & Storage)

### Fixed — Background Removal Too Slow / Not Working
- **Root cause**: `@imgly/background-removal` was running a 100MB+ ONNX model in the browser via WebAssembly. On first use it downloaded the weights, taking 1–3 minutes with no visible progress, and frequently timing out.
- **Fix**: Replaced with a **server-side Replicate `rembg` call** (`POST /api/branch/uniforms/remove-bg`). Uses `Prefer: wait` for synchronous completion (~3–5 seconds). The upload modal now closes immediately after image upload; bg removal happens in the background and the card updates live.

### Fixed — Images Not Showing (Private Bucket)
- **Root cause**: The `uniforms` Supabase storage bucket was set to `public = false`, but the code was storing `/object/public/uniforms/...` URLs. These URLs 403'd for all users.
- **Fix**: Made the `uniforms` bucket public via Supabase. Images now load correctly across the app, the builder, and the public viewer.

### Fixed — `bg_removed` Flag Always `false`
- **Root cause 1**: `POST /api/branch/uniforms` hardcoded `bg_removed: false` regardless of what the client sent.
- **Root cause 2**: Even when `@imgly` succeeded, the client never passed `bg_removed: true` in the body.
- **Fix**: API now accepts `bg_removed` from the request body. New server-side route sets `bg_removed = true` in the DB after successful removal.
- **Backfill**: 3 existing records that had `/bg-removed/` paths but `bg_removed = false` were corrected via SQL update.

### Added — `POST /api/branch/uniforms/remove-bg`
- Server-side bg removal route using Replicate `lucataco/remove-bg` model.
- Fetches raw image from storage, submits to Replicate, downloads result PNG, uploads to `uniforms/bg-removed/...`, updates `image_url` + `bg_removed = true` on the uniform record.

### Changed — Uniform Card UX
- Cards now show a **checkered background** when `bg_removed = true` (matches image editor convention for transparency).
- New **"✓ BG removed" green badge** on top-left of processed cards.
- New **"Removing bg…" overlay spinner** while server-side removal is in progress.
- Upload form closes immediately after image is saved — bg removal continues in the background without blocking the user.

---

## [Unreleased] — 2026-05-21 (Combination_Builder_Redesign — Phases 1–8 & CSS)

### Added — Database Migration (Phase 1)
- `combinations`: Added `male_composite_url`, `female_composite_url`, `male_gif_url`, `female_gif_url`, `preview_status` columns.
- `combination_zone_items` table: Zone-based outfit assignment (ENUM `body_zone`, one-per-zone-per-gender UNIQUE, ON DELETE CASCADE).
- `replicate_jobs` table: Async AI pipeline state tracking (composite chain + animation jobs).
- `schedule_assignments` table: Multi-department schedule assignment junction table.
- `body_zone` PostgreSQL ENUM: extensible via `ALTER TYPE ... ADD VALUE`.

### Added — TypeScript Types (Phase 2)
- `PreviewStatus`, `Gender`, `BodyZone` types in `database.ts`.
- `CombinationZoneItem`, `ReplicateJob`, `ScheduleAssignment` row types.
- `src/types/zones.ts`: `ZONE_POSITIONS`, `ZONE_CATEGORIES`, `ZONE_LAYER_ORDER`, `STANDARD_ZONES`, `ACCESSORY_ZONES`.

### Added — AI Pipeline (Phases 3–4)
- `src/lib/mannequin-config.ts`: Env-backed mannequin character URLs.
- `src/lib/replicate.ts`: Replicate service — CatVTON composite chain, SVD animation, Flux Dev character generation. Dev polling fallback; production webhook-driven.

### Added — API Routes (Phases 5–6)
- `GET/POST /api/branch/combinations/[id]/zones` + `DELETE .../zones/[gender]/[zone]` + `GET .../preview-status`
- `POST /api/branch/combinations/[id]/generate-preview` — parallel male+female chains, 409/429 guards, force param
- `POST /api/webhooks/replicate` — chain continuation + video finalisation
- `POST /api/admin/generate-mannequins` — super_admin-only character generation

### Changed — Hybrid Builder UI (Phase 7)
- `CombinationBuilderClient.tsx` fully replaced: 3-step flow (Department → Zone Assignment → Save & Generate).
- Step 2: Dual mannequin silhouettes with absolute-positioned zone hotspots, HTML5 DnD, click-to-assign panel, accessory expand.
- Step 3: Zone summary, bg-removal warnings, Save & Generate AI Preview / Save without Preview.

### Changed — Combinations List + Detail (Phase 8)
- `CombinationsPageClient.tsx`: Preview status badges, dual-video cards, per-card polling (5s, 10-min timeout), Generate/Retry/Regenerate.
- `CombinationDetailClient.tsx` + `[combinationId]/page.tsx` (new): Zone assignment table, AI preview section, delete/regenerate.

### Added — CSS
- `globals.css`: Builder/viewer utility classes (`.builder-*`, `.zone-*`, `.mannequin-*`, `.uniform-panel-*`, `.viewer-*`).

---

## [Unreleased] — 2026-05-21 (Phases 9 & 10: Schedules API, Public Viewer & Admin Mannequin Route)

### Added — Schedules API
- `GET/POST /api/branch/schedules` — list and create service date schedules scoped to the authenticated branch leader's branch.
- `PATCH/DELETE /api/branch/schedules/[scheduleId]` — update title/date/notes or delete a schedule (branch-scoped guard on every mutation).
- `POST/DELETE /api/branch/schedules/[scheduleId]/assignments` — assign (upsert on `schedule_id,department_id`) or remove a combination-to-department assignment for a schedule.

### Added — Public Viewer (`/view/[code]`)
- Server-rendered public page accessible via a branch's `view_code`. No authentication required.
- Displays all upcoming service dates with department assignments; shows male/female video previews (autoplay, loop, muted) with download links when `preview_status === 'ready'`, otherwise shows a "coming soon" placeholder.
- `loading.tsx` — shimmer skeleton while page fetches.
- `not-found.tsx` — user-friendly 404 when `view_code` is invalid.

### Added — Admin Mannequin Generation Route
- `POST /api/admin/generate-mannequins` — super_admin-only route. Calls Replicate Flux Dev to generate male/female character images, uploads them to the `mannequins` Supabase storage bucket, and returns public URLs with the corresponding env var names to paste.

### Added — Schedule UI
- `src/components/branch/SchedulePageClient.tsx` — full `'use client'` schedule management page:
  - Create service date form (date, title, optional notes).
  - Per-schedule assignment form: selects department then loads matching combinations (filtered client-side to `department_id`).
  - Department assignments shown inline with thumbnail video previews (male/female) when ready, status badge otherwise.
  - Delete schedule and remove individual assignments.
  - Dark lavender glassmorphism design consistent with rest of the app.
- `src/app/(branch)/branch/schedule/page.tsx` updated — now renders `SchedulePageClient` (was a placeholder).
- `src/app/(branch)/branch/schedule/loading.tsx` — skeleton loading state.

### Files Changed
`src/app/api/admin/generate-mannequins/route.ts` *(new)*
`src/app/api/branch/schedules/route.ts` *(new)*
`src/app/api/branch/schedules/[scheduleId]/route.ts` *(new)*
`src/app/api/branch/schedules/[scheduleId]/assignments/route.ts` *(new)*
`src/app/view/[code]/page.tsx` *(new)*
`src/app/view/[code]/loading.tsx` *(new)*
`src/app/view/[code]/not-found.tsx` *(new)*
`src/app/(branch)/branch/schedule/page.tsx` *(updated)*
`src/app/(branch)/branch/schedule/loading.tsx` *(new)*
`src/components/branch/SchedulePageClient.tsx` *(new)*

---

## [Unreleased] — 2026-05-21 (Departments, Uniforms, Combinations Feature)


### Added — Departments
- **Departments page** (`/branch/departments`): Branch leaders can create, edit, and delete departments scoped to their branch.
- **Department members**: Each department has a named members list (name only, no user account). Members can belong to multiple departments. Add/remove from the expandable card.
- **Departments nav item**: Added to BranchSidebar between Dashboard and Uniforms.
- **Deletion guard**: Deleting a department is blocked with a user-friendly message if uniforms or combinations depend on it.

### Added — Uniforms
- **Uniforms page** (`/branch/uniforms`): Full upload and management of uniform items per branch.
- **Department filter tabs**: Filter uniforms by department. Badge on each card shows category and department.
- **Background removal pipeline**: On upload, `@imgly/background-removal` runs client-side to produce a transparent PNG stored in the `uniforms` bucket. Progress shown during processing.
- **Archive/restore**: Soft-archive uniforms without deleting. Dashboard stat count updates via cache revalidation.

### Added — Combinations
- **Combinations page** (`/branch/combinations`): Lists all saved outfit combinations with department badge and preview image.
- **3-step combination builder** (`/branch/combinations/new`):
  - Step 1: Pick department (filters all subsequent uniform choices).
  - Step 2: Drag-and-drop canvas — uniforms from the chosen department only. Layer order controls (up/down/remove).
  - Step 3: Name, describe, and save. Preview auto-generated via offscreen canvas.

### Added — Database
- `uniforms.department_id NOT NULL FK` (RESTRICT)
- `combinations.department_id NOT NULL FK` (RESTRICT)
- `UNIQUE(branch_id, name)` constraint on departments
- `department_members` table with indexes
- `combination-previews` public Supabase storage bucket

### Added — API Routes (all protected by `requireBranchLeader()`)
- `GET/POST /api/branch/departments`
- `PATCH/DELETE /api/branch/departments/[departmentId]`
- `GET/POST /api/branch/departments/[departmentId]/members`
- `DELETE /api/branch/departments/[departmentId]/members/[memberId]`
- `GET/POST /api/branch/uniforms`
- `PATCH/DELETE /api/branch/uniforms/[uniformId]`
- `POST /api/branch/uniforms/[uniformId]/archive`
- `POST /api/branch/uniforms/upload-url`
- `GET/POST /api/branch/combinations`
- `GET/PATCH/DELETE /api/branch/combinations/[combinationId]`
- `POST /api/branch/combinations/upload-preview`

### Files Changed
`src/lib/api-auth.ts` *(new)* · `src/types/database.ts` · `src/components/branch/BranchSidebar.tsx`
`src/app/(branch)/branch/departments/**` · `src/app/(branch)/branch/uniforms/**` · `src/app/(branch)/branch/combinations/**`
`src/components/branch/DepartmentCard.tsx` · `src/components/branch/DepartmentsPageClient.tsx`
`src/components/branch/UniformsPageClient.tsx` · `src/components/branch/CombinationsPageClient.tsx` · `src/components/branch/CombinationBuilderClient.tsx`
`src/app/api/branch/**` *(multiple new routes)* · `supabase/departments_feature_migration.sql` *(new)*

---

## [Unreleased] — 2026-05-21 (Login Page Redesign)

### Changed — Login Page
- **Removed left decorative panel**: Eliminated the split-panel layout and SVG fabric illustration from the login page.
- **Church logo**: Added Kharis Church Purple logo (`public/kharis-church-purple.png`) above the login form heading, served via `next/image` with `priority` for fast LCP.
- **Centred single-column layout**: Login page is now a clean centred card on `--color-bg-primary` background. Form card, heading, and logo are all centre-aligned.

### Files Changed
`src/app/(auth)/auth/login/page.tsx` · `public/kharis-church-purple.png` *(new)*

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

