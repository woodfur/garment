# Polar PRD

## Polar — Product Requirements Document (PRD)

Polar is a mobile-first visual uniform planning and operations platform for churches and uniform-based organizations.

---

## Core Features

- Uniform planning studio
- Digital mannequin visualization (2D layered canvas)
- Combination builder
- Scheduling calendar
- Image export & sharing (WhatsApp-friendly)
- Inventory & accessory management
- Member viewing portal (branch view code — no account required)
- Creative design sandbox
- AI-generated outfit preview video (Phase 2)

---

## Target Users

- **Super Admin** — Platform operator; creates and manages church branches
- **Branch Leaders / Uniform Team Leads** — Authenticated users; manage uniforms, combinations, and schedules for their branch
- **Department Members** — Unauthenticated viewers; use a shared branch view code to access their branch's schedule page

---

## Access & Authentication Model

| Role | Auth | Access Scope |
|------|------|--------------|
| Super Admin | Supabase Auth (email/password) | Full platform — all branches |
| Branch Leader / Uniform Lead | Supabase Auth (email/password) | Their branch only (RLS enforced) |
| Department Member | Branch View Code (no account) | Read-only view of full branch schedule |

- Members receive a **shared branch view code** (short alphanumeric, e.g. `GCC-4892`)
- Entering the code on the public viewer page unlocks the branch's current and upcoming service uniform schedule
- Members see the **whole branch's schedule** (not filtered by department)
- No personal account creation required for members

---

## Branch Structure

```
Super Admin
  └── Branch (e.g. "Grace Chapel Central")
        ├── Branch Leader (authenticated)
        ├── Departments (e.g. Choir, Ushers, Sanctuary Team)
        └── Service Schedule → Uniform Combinations per date
```

---

## Core Modules

1. **Organization & Branch Management** — Super admin creates branches; assigns branch leaders
2. **Uniform Planning Studio** — Upload and manage uniform items per branch
3. **Visualization Engine** — 2D layered mannequin canvas (Konva.js); stack clothing items as PNG layers
4. **Smart Combination & Rotation System** — Build named outfit combinations; plan rotation across service dates
5. **Scheduling & Calendar Management** — Assign combinations to specific service dates
6. **Export & Sharing** — Export current outfit composite as PNG image; optional WhatsApp share
7. **Inventory & Accessories Management** — Track physical stock of uniform items
8. **Creative Uniform Design Sandbox** — Freeform outfit experimentation before committing to a schedule
9. **Member Viewing Portal** — Public branch page unlocked by view code; shows upcoming service uniforms

---

## Technology Goals

- Mobile-first (responsive web)
- Lightweight and fast
- Highly visual
- Non-technical friendly (team leads, not developers)
- Simple export/sharing workflow

---

## MVP Scope (Phase 1)

- Branch setup by super admin
- Branch leader authentication (Supabase Auth)
- Uniform item uploads (images → Supabase Storage)
- 2D layered mannequin canvas (Konva.js)
- Combination builder
- Service date scheduling
- PNG image export
- Member viewer portal (branch view code)
- Inventory tracking

---

## Future Features

### Phase 2
- AI-generated outfit preview video (Kling AI via Replicate — image-to-video from mannequin composite)
- Rotation intelligence & smart recommendations
- GIF generation

### Phase 3
- AI-generated video with motion (full outfit walkthrough)
- QR inventory tracking
- Advanced analytics & reporting

---

## Export & Sharing (Clarified)

- The **uniform team lead** can export the planned outfit for any service day as a **PNG image** or (Phase 2) a short **AI-generated video**
- **Department members** can self-serve by visiting the branch viewer page using their view code
- No WhatsApp API integration required — sharing is handled manually by the user after export