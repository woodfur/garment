# Polar PSD

## Polar — Product & System Design (PSD)

---

## Architecture Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 15 (App Router) | Feature-based directory structure |
| Backend / Database | Supabase | Postgres, RLS, Realtime, Storage, Edge Functions |
| Authentication | Supabase Auth | Email/password for super admin & branch leaders |
| Canvas / Visualization | Konva.js | 2D layered mannequin compositor; PNG export |
| Styling | TailwindCSS | Utility-first, mobile-first |
| Animation | Framer Motion | UI transitions and micro-interactions |
| AI Video (Phase 2) | Replicate (Kling AI) | Image-to-video from mannequin composite PNG |
| AI Text/Image (future) | OpenRouter | Gateway for future generative AI features |
| Hosting | Vercel | Serverless Next.js deployment |

---

## Frontend Architecture

- **App Router** with feature-based route grouping
- Route groups:
  - `(admin)` — Super admin dashboard (branch management, platform oversight)
  - `(branch)` — Branch leader dashboard (uniforms, combinations, scheduling, inventory)
  - `(viewer)` — Public member viewer portal (unlocked via branch view code, no auth)
- Shared UI component library (Tailwind + Framer Motion)
- Konva.js canvas isolated in a dedicated `UniformCanvas` component

---

## Authentication & Access Model

### Authenticated Users (Supabase Auth)
- Super admin: full platform access
- Branch leaders: branch-scoped access enforced by RLS

### Unauthenticated Viewers (Branch View Code)
- Member enters a short branch view code on the public viewer page
- Code is validated server-side against the `branches` table
- A **short-lived signed token** (or session cookie) grants read-only access to that branch's public schedule data
- No Supabase Auth account required for members

### RLS Strategy
- Every branch-scoped table includes a `branch_id` column
- Branch leaders have a `branch_id` stored in their `profiles` row
- RLS policies: `auth.uid()` → `profiles.branch_id` → row filter
- Super admin bypasses RLS via service role key (server-only)

---

## Database Schema (Supabase Postgres)

### Core Tables

```
branches
  id, name, view_code, leader_user_id, created_at

profiles
  id (= auth.uid), email, role (super_admin | branch_leader), branch_id

departments
  id, branch_id, name, created_at

uniforms
  id, branch_id, name, category, image_url, storage_path, created_at

combinations
  id, branch_id, name, notes, created_at

combination_items
  id, combination_id, uniform_id, layer_order, x, y, scale, created_at

schedules
  id, branch_id, combination_id, service_date, department_id (nullable), notes, created_at

inventory_items
  id, branch_id, uniform_id, quantity, unit, last_updated

inventory_transactions
  id, branch_id, inventory_item_id, change_amount, reason, created_by, created_at

announcements
  id, branch_id, title, body, created_at

audit_logs
  id, branch_id, user_id, action, table_name, record_id, created_at
```

---

## Supabase Storage

- **Bucket: `uniforms`** — Stores uniform item images (PNG, JPG)
  - Path pattern: `{branch_id}/{uniform_id}/{filename}`
  - Public read access for authenticated branch members
- **Bucket: `exports`** — Stores generated composite PNG exports and AI videos
  - Path pattern: `{branch_id}/exports/{timestamp}/{filename}`
  - Temporary signed URLs for download/share

> Cloudinary is **not required**. Supabase Storage with its built-in CDN handles all image storage and delivery needs for Phase 1. Video generation (Phase 2) is handled by Replicate and stored in the `exports` bucket.

---

## Visualization System (Konva.js)

- **Stage** → Single canvas viewport (mannequin dimensions, e.g. 400×700px)
- **Layers** (ordered bottom to top):
  1. Base mannequin silhouette (static SVG/PNG)
  2. Bottom wear
  3. Top wear
  4. Outer wear / accessories
  5. Footwear
  6. Head accessories
- Each `KonvaImage` node is draggable, scalable, and z-ordered
- Combination state is serialized as JSON (position, scale, layer_order per item) → saved to `combination_items` table
- **Export**: `stage.toDataURL({ pixelRatio: 2 })` → PNG blob → upload to Supabase `exports` bucket

---

## AI Video Pipeline (Phase 2)

```
1. User clicks "Generate Preview Video"
2. Konva canvas exports composite PNG → uploaded to Supabase exports bucket
3. Next.js API route (Edge Function) sends image URL to Replicate (Kling AI model)
4. Replicate returns a prediction ID (async job)
5. Supabase Realtime or polling notifies frontend when complete
6. Generated video URL stored in schedules or exports table
7. User downloads or shares the video
```

- Model: `klingai/kling-v1-5-image-to-video` via Replicate API
- Processing is asynchronous — UI shows a "generating..." state
- Videos are 5–8 seconds, showing the outfit with natural motion

---

## Branch View Code System

- Each branch has a unique `view_code` (e.g. `GCC-4892`) stored in the `branches` table
- Public page: `polar.app/view` — member enters their code
- Server action validates the code → sets a **read-only session cookie** scoped to that `branch_id`
- Cookie grants access to `polar.app/view/[branch_id]/schedule` — fully public-facing, read-only
- Cookie expiry: 30 days (re-enter code to refresh)
- No email, no password, no account required

---

## Development Phases

### Phase 1 (MVP)
- Supabase project setup (schema, RLS, storage buckets)
- Supabase Auth (super admin + branch leader accounts)
- Branch management (super admin)
- Uniform item CRUD + image upload to Supabase Storage
- Konva.js mannequin canvas + combination builder
- Service schedule management
- PNG composite export
- Branch view code + member viewer portal
- Inventory tracking

### Phase 2
- AI video generation (Replicate + Kling AI)
- Rotation intelligence (smart schedule suggestions)
- GIF export option
- Announcements module

### Phase 3
- Advanced AI video (full outfit walkthrough with motion)
- QR inventory tracking
- Analytics & reporting dashboard