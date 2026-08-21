# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

> **Next.js 16 + React 19 + Turbopack.** This is a newer Next.js than most training data. `AGENTS.md` (included above) requires reading the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code. Notable local conventions: middleware lives in `src/proxy.ts` (exported as `proxy`, not `middleware`), and the React Compiler is enabled (`reactCompiler: true`) — do not hand-add `useMemo`/`useCallback` for things the compiler already memoizes.

## Commands

```bash
npm run dev      # Next dev server (Turbopack) on :3000
npm run build    # Production build
npm run start    # Serve production build
npm run lint     # ESLint (eslint-config-next) — see caveat below

# Tests: node's built-in runner, no npm script
node --test 'src/lib/*.test.mjs'      # all tests (quote the glob — node expands it)
node --test src/lib/flow-rules.test.mjs   # a single test file
```

- **`node --test src/lib/` (a directory) fails** with `MODULE_NOT_FOUND` — pass the quoted glob or explicit files instead.
- `palette-prompt.test.mjs` imports a `.ts` module directly and relies on Node's native type stripping (Node 22.22 locally). Other test files import `.mjs` siblings.
- **There is no typecheck script.** Rely on `npm run build` or your editor's TS server.
- **`npm run lint` currently exits non-zero** with ~63 pre-existing errors, almost all `@typescript-eslint/no-explicit-any` from the `admin as any` casts (see *Database* below). This is the baseline, not something you broke — check that your diff doesn't *add* to it rather than expecting a clean run.
- **`allowImportingTsExtensions` is on.** Pure modules that are unit-tested import each other with an explicit `.ts` extension (`./palette-prompt.ts`), because `node --test` cannot map a `.js` specifier onto a `.ts` file and Node has no path-alias support. Turbopack resolves these fine. Keep the extension when a module is reachable from a `*.test.mjs`.
- Fixes in git history are tracked as "cycle N" / "GAP-N" — audit-driven hardening passes, recorded in `CHANGELOG.md`.

## What this is

**Garment** is an internal tool for a multi-branch church organization to manage uniforms and generate AI previews of uniform combinations on mannequins. The flow: a branch leader uploads garment images (or just picks colours) → assigns them to body **zones** → the app renders them onto a human figure via Replicate AI → produces per-gender preview images and animated GIFs → publishes a read-only schedule viewable by congregation members through a shareable code.

## Roles & route groups

| Route group | Audience | Auth mechanism |
|---|---|---|
| `(admin)` → `/admin/*` | `super_admin` | Supabase session cookie |
| `(branch)` → `/branch/*` | `branch_leader` | Supabase session cookie |
| `(branch-auth)` → `/branch/change-password` | branch leader forced password reset (`must_change_password`) | Supabase session |
| `(auth)` → `/auth/login` | login | — |
| `/view/[code]` + `/api/public/*` | congregation viewers | **None — fully public.** The URL's `view_code` is the only secret |

`proxy.ts` only checks for **cookie presence** on `/admin` and `/branch` (fast, no network call) — real authorization happens in Server Components via `getAuthContext()` and in API routes via the guards below.

The public viewer has **no session at all**: `/view/[code]/page.tsx` looks up `branches.view_code` with the service-role client and renders whatever it finds. Treat the view code as a bearer capability. `src/lib/utils.ts` → `generateViewCode()` mints them from an unambiguous alphabet (no O/0/I/1).

## Auth architecture (`src/lib/`)

- **`auth.ts` — `getAuthContext()`**: the canonical "who is this user" call for **Server Components only**. Two-layer cached: `React.cache()` dedupes within one render; `unstable_cache` persists the `profiles` lookup for 60s across requests. `supabase.auth.getUser()` is deliberately *not* cached (JWT must validate every request). Returns `null` when unauthenticated.
- **`api-auth.ts` — `requireBranchLeader()` / `requireSuperAdmin()`**: the guard every non-public API route must call first. They return either an auth context or a `NextResponse` error — call site pattern is `const r = await requireX(); if (r instanceof NextResponse) return r;`. `requireBranchLeader()` additionally narrows `branchId` to non-null, and **every subsequent query must still filter on `auth.branchId`** — the admin client bypasses RLS, so the guard alone does not isolate tenants.
- **`supabase/server.ts`**: `createClient()` (async, cookie-bound, RLS-enforced — for user-scoped reads) vs **`createAdminClient()` (synchronous singleton, service-role, bypasses RLS)**. The sync-ness is load-bearing: call sites do `createAdminClient()` without `await`, and `as any` casts would hide the resulting bug — **do not make it async**.
- **`supabase/client.ts`**: browser client for Client Components.

## Preview generation (`gpt-image-2`)

Every preview — palette look, colour pieces, photographed garments — is rendered by **one OpenAI `images.edit` call**. There is no prediction chain, no webhook, and no polling loop; that entire Replicate pipeline was removed.

**The central technique: colour is passed as pixels, not prose.** Describing `#CCF755` in a sentence leaves the model to interpret a colour name, which is what made palettes come out wrong. `palette-swatch.ts` renders the approved colours as a flat, edge-to-edge, **wordless** bar chart, and the prompt tells the model to sample its pixels. Two rules keep the chart out of the render, and both are load-bearing:
- **No text in the chart** — models draw text they see in reference images.
- **No gaps, borders, or background** — any padding colour reads as an extra approved colour and shows up in the garments.

### Module layout

| Module | Responsibility | Pure? |
|---|---|---|
| `openai-image.ts` | `generateImage()` / `editImage()` → `Buffer`. Owns the model ID, b64 decode, error mapping. | no (network) |
| `palette-swatch.ts` | Renders the colour chart; `swatchLayout()` guarantees gapless tiling. | mostly (sharp) |
| `look-prompt.ts` | `planLook()` → ordered reference slots **+** the prompt describing them. | **yes, tested** |
| `preview-render.ts` | Fetches reference bytes, calls OpenAI, persists to storage, updates status. | no |
| `palette-prompt.ts` | Palette prompt text + `colorPromptPhrase()` hex→name mapping. | **yes, tested** |

**`planLook()` is the piece to be careful with.** The prompt addresses reference images by ordinal ("the third reference image is…"), so the slot order and the prompt text must stay in lockstep. It never re-sorts its input — callers pass photo items already ordered by `ZONE_LAYER_ORDER`. `look-prompt.test.mjs` pins the ordinal↔slot correspondence; if you change slot ordering, those tests are what catch the drift.

Reference order is always: base figure (if configured) → colour chart (if colour pieces) → garment photos. Cap is **16** (a real gpt-image-2 limit); exceeding it throws rather than silently dropping a garment.

### Facts about gpt-image-2 worth not rediscovering

- Always returns **base64**, never a URL — so there's nothing to re-download before uploading to storage.
- `background: "transparent"` is **unsupported**, which is why background removal stayed on Replicate.
- `model` defaults to `gpt-image-1.5` on edits — it must be passed explicitly every call.
- `input_fidelity` is not applicable, and there is **no `thinking` parameter** in the SDK despite blog posts claiming otherwise.
- Editing **regenerates pixels rather than warping the input**. Photographed garments are re-interpreted, not composited — the honest trade made when IDM-VTON was dropped.
- ~$0.165 per high-quality 1024×1536 image, so a two-gender look costs ~$0.33.

### Palette look options

Two optional inputs, both handled in `palette-prompt.ts`:

- **Free-text direction** (`notes`, capped at `MAX_PALETTE_NOTES`) is injected as an
  "additional styling direction" clause, placed **before** the modesty and negative
  clauses so those still read last, and explicitly subordinated to the colour lock —
  otherwise direction like "add a red scarf" defeats the point of a palette. Stored on
  `canvas_data.notes` so a look records what it was generated from.
- **Both figures are rendered, and the look is stored with `gender: null`.** A palette is
  a colour scheme for a whole department, and departments have men and women. Null gender
  is the legacy-look path that every consumer already treats as "either" — the assignment
  route takes the slot's gender, `filterAssignableCombinations` accepts it for both — so
  one palette look fills a male *and* a female assignment. Rendering only one figure would
  store a null composite for the other gender and show "preview coming soon" wherever it
  was assigned, which is why the two go together. Costs two renders (~$0.33), the same as
  the two separate palette looks it replaces.
- **Palette looks are never department-scoped.** The route hardcodes `all_departments:
  true` with an empty `department_ids`, so they apply everywhere including departments
  added later, and the form asks nothing about it. `departmentName` on the prompt is
  therefore optional and normally absent, and `buildPaletteLookName()` falls back to the
  dominant colour ("Blush pink palette") rather than a department, so looks stay
  distinguishable in a list.

### Prompt engineering is domain logic

`garmentClause()` in `look-prompt.ts` and `buildPalettePrompt()` both encode non-negotiable requirements: modest church dress (covered shoulders/chest, knee-to-mid-calf skirts, closed-toe shoes) and Black African models. These strings are the product. Tests assert both what must appear (hex + RGB, modesty clauses) and what must **not** (user-supplied colour labels, the word "near"). Change a prompt and the tests will tell you which invariant you broke.

A suit is built as three pieces — shirt (`top`), jacket (`outer`), trousers (`bottom`) — and `ZONE_LAYER_ORDER` runs `top → outer` so the jacket layers over the shirt. The male `top` clause is deliberately **sleeve-agnostic**: pinning "short-sleeve" there fought every suit look. The `full_body` zone means a dress for women and a suit for men, which is why `zoneLabel(zone, gender)` exists — the label differs by figure while the zone, category, and women's prompt do not.

### Async contract

`POST .../generate-preview` validates, sets `preview_status = 'processing'`, hands the render to `waitUntil()`, and returns **202** immediately. The client keeps polling `preview-status` exactly as it always did. Palette looks (`POST /api/branch/palette-looks`) stay **synchronous** inside the request. Both routes set `maxDuration = 300` because a full-body render takes well over a minute.

`checkAndMarkReady()` flips status to `ready` only once every gender that *has* zone items has a composite — a male-only combination must still reach `ready`.

### GIFs are gone

The Stable Video Diffusion step was removed: OpenAI's Videos API (`sora-2`) is deprecated with removal on **24 Sep 2026** and no announced successor, so there was nothing to migrate it to. The `male_gif_url`/`female_gif_url` columns and all their read sites remain so previously generated GIFs still display; nothing writes them anymore. `render-download.ts` already prefers composites and falls back to GIFs.

`replicate_jobs` is now orphaned — nothing writes it. The table was deliberately left in place rather than shipping a destructive migration; the combination-delete route still clears legacy rows.

### Palette look options

Two optional inputs, both handled in `palette-prompt.ts`:

- **Free-text direction** (`notes`, capped at `MAX_PALETTE_NOTES`) is injected as an
  "additional styling direction" clause, placed **before** the modesty and negative
  clauses so those still read last, and explicitly subordinated to the colour lock —
  otherwise direction like "add a red scarf" defeats the point of a palette. Stored on
  `canvas_data.notes` so a look records what it was generated from.
- **Both figures are rendered, and the look is stored with `gender: null`.** A palette is
  a colour scheme for a whole department, and departments have men and women. Null gender
  is the legacy-look path that every consumer already treats as "either" — the assignment
  route takes the slot's gender, `filterAssignableCombinations` accepts it for both — so
  one palette look fills a male *and* a female assignment. Rendering only one figure would
  store a null composite for the other gender and show "preview coming soon" wherever it
  was assigned, which is why the two go together. Costs two renders (~$0.33), the same as
  the two separate palette looks it replaces.
- **Palette looks are never department-scoped.** The route hardcodes `all_departments:
  true` with an empty `department_ids`, so they apply everywhere including departments
  added later, and the form asks nothing about it. `departmentName` on the prompt is
  therefore optional and normally absent, and `buildPaletteLookName()` falls back to the
  dominant colour ("Blush pink palette") rather than a department, so looks stay
  distinguishable in a list.

### Prompt engineering is domain logic here

`buildGarmentDescription()`, `buildColorPrompt()`, `buildPalettePrompt()` and `generateCharacterImage()` all encode the same non-negotiable requirements: modest church dress (covered shoulders/chest, knee-to-mid-calf skirts, closed-toe shoes) and Black African models. These strings are the product, not boilerplate — keep the constraints intact when editing any one of them, and mirror changes across the others.

## Body zones (`src/types/zones.ts`)

The domain's core abstraction. A body is divided into `BodyZone`s (head, top, outer, full_body, bottom, footwear, plus six accessory slots). Each combination assigns one uniform per zone per gender (`combination_zone_items`). Constants that govern behavior:
- `ZONE_LAYER_ORDER` — compositing order (innermost → outermost); the pipeline iterates this.
- `ZONE_POSITIONS` — x/y hotspot coordinates (as % of image) for the interactive editor; the comment notes these are estimates needing calibration against real generated images.
- `ZONE_CATEGORIES` — maps a zone to a uniform category; `zoneToCategory()` in `replicate.ts` separately maps zones to the IDM-VTON `upper_body`/`lower_body`/`dresses` enum.
- `STANDARD_ZONES` vs `ACCESSORY_ZONES` — the preview route requires at least one non-accessory zone item per gender.

`src/types/zones.typecheck.ts` is a compile-only file that `satisfies`-checks these records against the DB enums; it exists so a new `BodyZone` can't be added without updating every map.

## Shared pieces and looks (`src/lib/scope.ts`)

Both uniform pieces and looks belong to **many** departments. The original schema made both department-exclusive (single `department_id` FK), which forced duplicating a shared white shirt per department — and, worse, re-rendering an identical look per department at real cost per image. Migrations `005_shared_pieces.sql` (uniforms) and `006_shared_looks.sql` (combinations) replaced that with:

- `department_ids uuid[]` — explicit departments
- `all_departments boolean` — also covers departments created **later**
- `genders text[]` — **uniforms only**; both values means unisex

Looks stay single-gender: a look is one outfit on one figure, so multi-gender would mean a second render rather than a saved one.

**The matching rule, and the only place it's defined:** `matchesDepartment()` in `scope.ts`, shared by pieces and looks. The API routes, `UniformsPageClient`, the builder, and the `flow-rules.mjs` spec module all defer to it so they can't drift. `validateDepartmentScope()` / `validatePieceScope()` are the write-path validators (non-empty selection, valid UUIDs, dedupe, normalised gender order); routes must *additionally* verify the department ids belong to the caller's branch, which needs a DB round trip and is deliberately left out of the pure module.

**The assignment guard is the thing that makes shared looks work.** `schedule_assignments` is keyed `UNIQUE (schedule_id, department_id, gender)`, so one look can already sit against several departments in a service. The only blocker was an equality check in `schedules/[scheduleId]/assignments`; it now calls `matchesDepartment()`. Since a shared look no longer implies a single department, both assign dialogs ask which department it is being scheduled for whenever more than one applies.

Gotchas worth not rediscovering:
- **`department_id` (both tables) and `uniforms.gender` are dead columns.** Kept (commented, nullable, FK dropped) rather than dropped destructively. Nothing reads or writes them. Dropping the `ON DELETE RESTRICT` FKs was *required*, not cosmetic — they would otherwise keep blocking department deletion for legacy rows regardless of app code.
- **Dropping those FKs breaks PostgREST embeds, and this has already caused one outage.** PostgREST derives `departments(name)` / `uniforms(count)` embed syntax from foreign keys. After 005, `uniforms(count)` in `/api/branch/departments` stopped resolving, the route 500'd, and the client's `Array.isArray` guard silently rendered *zero departments* app-wide. Counts and names are now computed from `department_ids` in separate queries. **Before dropping any FK, grep for embeds that cross it.**
- **Deleting a department detaches it from pieces and looks** rather than blocking, and may leave either with zero departments. Such a row matches nothing; `isOrphaned()` drives a "No department" badge so it stays findable.
- **The department filter uses a string-interpolated `.or()`** (`all_departments.eq.true,department_ids.cs.{id}`) because the two conditions are a disjunction. The id is UUID-validated first — the CHANGELOG records a past filter-injection bug from exactly this pattern. Keep that validation.
- Chained `.or()` calls **append** (`searchParams.append`), so the department and archived filters correctly AND together.

## Database

Single Supabase Postgres. Generated types in `src/types/database.ts` (`Database` interface) — **but it lags the real schema** (`replicate_jobs`, `uniform_reminder_deliveries` are missing).

Two coping patterns coexist:
- **Old:** `const db = admin as any` (throughout `replicate.ts` and most routes) — this is where the lint baseline comes from.
- **New and preferred:** declare a minimal structural interface for the query chain and cast once, e.g. `PaletteLooksDb` in `api/branch/palette-looks/route.ts` or `DeliveryDb` in `api/cron/uniform-reminders/route.ts`. Use this for new code; better still, regenerate `database.ts`.

Core tables: `branches`, `profiles`, `invitations`, `departments`/`department_members`, `uniforms`, `combinations`/`combination_zone_items`, `schedules`/`schedule_assignments`, `inventory_items`/`inventory_transactions`, `replicate_jobs`, `uniform_reminder_deliveries`, `announcements`, `audit_logs`.

SQL lives in `supabase/migrations/00N_*.sql` (sequential) plus loose one-off `.sql` files at `supabase/` root. Nothing applies them automatically — run them against the project by hand.

Storage buckets: `uniforms` (raw + `bg-removed/` variants), `combination-previews` (composites, GIFs, palette boards), `mannequins` (generated base figures), `exports`.

## Caching & revalidation

Server Components wrap their Supabase reads in `unstable_cache` with per-branch tags; mutating API routes call `revalidateTag`. **Next.js 16 requires the second argument** — `revalidateTag(tag, "default")` — a missing one is a type error. Tags in use:

- `dashboard-stats-${branchId}` — counts (uniforms, combinations, schedules)
- `dashboard-lists-${branchId}` — recent looks / upcoming schedules
- `branches` — the admin branch list
- `["profile", userId]` — `getCachedProfile` in `auth.ts`, 60s TTL, **untagged on purpose** (avoids global invalidation risk)

`next.config.ts` also sets `experimental.staleTimes` (30s dynamic / 180s static client-side RSC cache), so a mutation may not appear instantly on client-side navigation even after a correct `revalidateTag`.

## Public sharing (`src/lib/share-card.ts`)

The workflow being replaced is a leader forwarding one image into a department WhatsApp
group — both figures side by side with the garments named underneath. That shape drives
the design: the per-department pack is a **single PNG**, not a PDF, because nobody
forwards a PDF into a group chat.

- `GET /api/public/schedules/[scheduleId]/departments/[departmentId]/card?code=` renders it.
  Auth is the branch `view_code`, same as the other public routes.
- Garment names come from `combination_zone_items` sorted by `ZONE_LAYER_ORDER`. Palette
  looks have no garment rows, so they list their approved colours instead — named via
  `nearestColorName()` with a swatch, because a hex code means nothing to a reader.
- The image band collapses (900px → 96px) when no figure has rendered, so an unfinished
  card is not mostly blank.
- `/view/[code]` groups assignments by department and takes `?dept=<id>`. That keeps the
  page a Server Component **and** gives leaders a per-department link to post directly.

The whole-service PDF (`schedule-package.ts`) still exists for anyone wanting every
department at once.

## Scheduled reminders

`vercel.json` registers two crons (Mon + Thu 10:00 UTC) hitting `GET /api/cron/uniform-reminders`. The route authenticates with `Authorization: Bearer ${CRON_SECRET}` — not the branch guards — resolves today's target service date via `getReminderTargetDate()`, and POSTs a payload to a **Zapier** webhook. Idempotency comes from the `uniform_reminder_deliveries` table (unique on `branch_id,schedule_id,reminder_kind`), so re-running the cron is safe.

## Pure-logic modules and tests

Business rules that are worth testing are extracted into standalone modules under `src/lib/` with a sibling `*.test.mjs`: `flow-rules.mjs`, `render-download.ts`, `schedule-package.ts`, `uniform-reminders.ts`, `palette-prompt.ts`, `palette-swatch.ts`, `look-prompt.ts`, `scope.ts`, `share-card.ts`, `dashboard-hero.ts`, `mood-board-layout.ts`. They import nothing from Next.js or Supabase so the node test runner can load them directly. `flow-rules.mjs` is plain `.mjs` (not TS) for that reason — the newer files use `.ts` and lean on Node's type stripping. **Follow this pattern:** put new decision logic in a pure module and test it, rather than inline in a route handler.

`dashboard-hero.ts` picks the look on the dashboard hero plate. Two rules worth knowing: it takes the soonest service that actually **has rendered looks**, not simply the soonest service (services are created ahead in bulk, so the very next one is usually still empty while a later one is fully dressed — the label names whichever was chosen, so it stays honest about the day); and the look is drawn **at random** from that service so the plate varies per visit. The split matters — `collectHeroCandidates()` is deterministic and cached, `heroLookFrom()` does the draw per request. Caching the draw would freeze one department for the whole cache window. `random` is injectable so tests can pin it.

`schedule-package.ts` hand-writes a PDF (`%PDF-1.4`, object table, JPEG XObjects) with no PDF library — sharp prepares the images. It's dense but self-contained; don't add a PDF dependency without a reason.

## Environment variables

Required (see `.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public Supabase client
- `SUPABASE_SERVICE_ROLE_KEY` — service-role (admin client; server-only)
- `OPENAI_API_KEY` — gpt-image-2; required for every preview render
- `REPLICATE_API_KEY` — **background removal only** (`rembg`, via plain `fetch`, no SDK). The `replicate` package is no longer a dependency.
- `NEXT_PUBLIC_APP_URL` — public base URL
- `NEXT_PUBLIC_SITE_URL` — public base URL used to build `/view/[code]` links in reminder emails (separate from `NEXT_PUBLIC_APP_URL`)
- `NEXT_PUBLIC_MANNEQUIN_MALE_URL`, `NEXT_PUBLIC_MANNEQUIN_FEMALE_URL`, `NEXT_PUBLIC_MANNEQUIN_FEMALE_TWO_PIECE_URL` — base figures for photo try-on (the two-piece variant falls back to the female URL)
- `CRON_SECRET`, `ZAPIER_UNIFORM_REMINDER_WEBHOOK_URL` — reminder cron

Mannequins are generated once and uploaded via `POST /api/admin/generate-mannequins` (or the `scripts/generate-*-mannequin.mjs` one-offs), then their public URLs are pasted into these env vars.

> **Gotcha:** the Supabase project ref is hardcoded in two places — the cookie name in `src/proxy.ts` (`sb-<ref>-auth-token`) and the `NEXT_PUBLIC_SUPABASE_URL`. If you point at a different Supabase project, **update both**, or the proxy's auth-cookie check will silently never match.

## Conventions

- **Styling is inline CSS-in-JS** using CSS custom properties — not Tailwind utility classes in markup, despite Tailwind v4 being installed. The token set lives in `src/app/globals.css` (`--color-*`, `--radius-*`, `--font-*`; warm-paper palette with a plum primary and terracotta accent). Use the variables; don't hardcode hex in components.
- Client Components are large single-file screens under `src/components/branch/` (`SchedulePageClient.tsx` is ~1200 lines). Server Component pages fetch, the `*Client` component owns all interaction. Match that split.
- API route handlers guard auth first, then operate via the appropriate Supabase client (user-scoped vs admin), then `revalidateTag` on mutation.
- `@/` is the path alias for `src/`.
- `/docs` is gitignored — internal docs go there. Product specs (`polar_PRD.md`, `polar_PSD.md`) and `CHANGELOG.md` are tracked at the repo root.
