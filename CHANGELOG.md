# Changelog

All notable changes to the Garment platform are recorded here.

---

## [Unreleased] — 2026-05-20

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

