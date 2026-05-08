# Eride Support — UI/UX Architecture Brief

> A self-contained design brief for redesigning the Eride Support experience.
> Hand this document to a UI/UX designer or an AI design tool (e.g. Lovable).
> Everything needed to design — brand, audience, page map, component
> inventory, states, content rules, accessibility, and hard constraints —
> lives in this single document.

---

## 1. Product at a glance

**Public-facing name:** **Eride Support**
**Internal system identity:** **Eride Dogma Support Centre**
**Internal tagline:** *Structured support. Controlled resolution.*

Eride Support is a multi-tenant support and bug-ticketing platform. The MVP
serves Eride Technologies (products: **E-Migration Assist**, **8Beauty**,
**Eride**), with the data model designed so additional organisations can be
onboarded later without restructure.

The product has **three distinct surfaces**, each with its own audience and
visual register:

| Surface           | Audience                   | Identity surfaced       | Tone         |
| ----------------- | -------------------------- | ----------------------- | ------------ |
| Public help pages | End-users / customers      | **Eride Support** only  | Calm, clear  |
| Internal admin    | Support agents, operators  | Eride Dogma full system | Operational  |
| Wallboard / TV    | Operations room (large TV) | "Dogma Command Centre"  | Cinematic    |

> **Rule:** "Dogma" branding **must never** be prominent on public-facing
> surfaces. The public surface is *Eride Support*. A small attribution like
> "Powered by Eride Dogma Support Centre" in the page footer is acceptable.
> Customer-facing email/WhatsApp is signed as **Eride Support**.

---

## 2. Audience & roles

### Public users (unauthenticated)
- Customers/visitors who hit a problem in one of Eride's products
- May have **no email** (WhatsApp-only) or **no WhatsApp** (email-only) — the
  contact-method flow must support either
- Mobile-first: most arrive from a help link in another product, on a phone
- Read English; non-technical; want the **shortest path** to "report" or
  "check status"

### Internal users (authenticated)
- **Support agent** — triage, reply, send updates, request more info
- **Engineering escalator** — push to Linear, mark in-engineering
- **Manager / observer** — read-only oversight, dashboards
- **Wallboard viewer** — display-only, no interaction

### Mobile vs desktop usage
- Public surfaces: **70%+ mobile** — design mobile-first, then expand.
- Internal admin: desktop-first — dense tables, multi-pane.
- Wallboard: 1080p TV, viewed from 3–6 metres away — huge type, high contrast.

---

## 3. Brand system

### 3.1 Voice
- **Premium, controlled, technical, executive.** Never playful, never bubbly.
- Use plain English short sentences. Avoid jargon and apologetic filler.
- Every public page must communicate **"we received it, we're tracking it,
  we'll close the loop."**

### 3.2 Colour palette (authoritative)

| Role                | Token             | Hex        | Notes                                |
| ------------------- | ----------------- | ---------- | ------------------------------------ |
| Dogma Black         | `dogma-black`     | `#050505`  | Deepest matte                        |
| Carbon Black        | `carbon`          | `#0B0F14`  | Hero base / dark cards               |
| Graphite            | `graphite`        | `#1F2933`  | Primary on dark, dark surfaces       |
| Gunmetal Grey       | `gunmetal`        | `#3B4652`  | Borders on dark                      |
| Steel Blue Grey     | `steel`           | `#5F7182`  | Subdued accent                       |
| Steel Slate         | `slate-accent`    | `#8FA1B5`  | Calm accent (Pinarello-inspired)     |
| Silver Mist         | `silver-mist`     | `#B8C5D0`  | Highlight on dark                    |
| Electric Ice Blue   | `ice`             | `#38BDF8`  | **Sparing** highlight only           |
| Silver White        | `silver-white`    | `#E5E7EB`  | Text on dark                         |
| Soft Grey Text      | `soft-grey`       | `#94A3B8`  | Secondary copy                       |
| Light Surface       | `light-surface`   | `#F8FAFC`  | Public page background               |
| Card White          | `card-white`      | `#FFFFFF`  | Light cards                          |
| Hairline Border     | `hairline`        | `#E5E7EB`  | Light card border                    |
| Critical Red        | `red`             | `#EF4444`  | Destructive / breach                 |
| Amber Warning       | `amber`           | `#F59E0B`  | "Approaching" SLA, warnings          |
| Success Green       | `green`           | `#10B981`  | "On track", success                  |

**Accent discipline:**
- Electric Ice Blue (`#38BDF8`) is a **highlight**, not a flood colour. Use
  for: top hairlines on hero/cards, the live-dot indicator, focus rings,
  CTA arrow on hover, status-pill outlines. Never as a button fill on the
  public surface.
- Steel Slate (`#8FA1B5`) and Silver Mist (`#B8C5D0`) carry the everyday
  metallic feel — borders, eyebrow text on dark, gradient stripes.
- The dark surfaces should look **matte and metallic**, like a Pinarello
  Dogma carbon frame photographed in a dark studio.

### 3.3 Typography
- **Sans:** Inter (400 / 500 / 600 / 700)
- **Mono:** Menlo / system mono — used **only** for ticket reference
  identifiers (e.g. `ER1-SUP-2026-000123`)
- **Scale (mobile → desktop):**
  - H1 hero: `text-4xl` → `text-6xl`, `font-semibold`, `tracking-tight`,
    `leading-[1.05]`
  - H2 section: `text-xl` → `text-2xl`, `font-semibold`
  - Body: `text-sm` → `text-base`, `leading-relaxed`
  - Eyebrow: `text-[11px]` uppercase, `tracking-[0.22em–0.28em]`
- **Numerals:** prefer `tabular-nums` for any counter, ETA, or SLA timer.

### 3.4 Spacing & shape
- Border radius: **`rounded-2xl`** for primary cards, `rounded-xl` for
  small tiles, `rounded-full` for chips/pills.
- Shadow language is *subtle and downward*:
  `shadow-[0_20px_40px_-20px_rgba(0,0,0,0.6)]` for dark hero cards,
  `shadow-[0_12px_30px_-18px_rgba(11,15,20,0.25)]` for light cards.
- Touch targets: ≥ 44 × 44 px on mobile.
- Page gutters: `px-5` mobile → `px-8` tablet → centred `max-w-5xl` desktop.

---

## 4. Information architecture (route map)

```
Public (no auth)
├── /                        → redirect → /help
├── /help                    Landing page
├── /help/report-problem     Report-a-problem form (+ confirmation state)
├── /help/track-ticket       Reference + contact lookup
└── /help/ticket/:reference  Verify panel → Ticket view (with reply, reopen)

Internal (auth required, except login)
├── /admin/support/login     Login
├── /admin/support/wallboard Read-only ops dashboard (cinematic dark)
├── /admin/support/tickets   Ticket queue + filters
├── /admin/support/tickets/:id  Ticket detail (timeline, reply, escalate)
├── /admin/support/templates Reply templates
└── /admin/support/settings  Org settings, products, SLA config
```

> Designers may rename internal screens but **must not** rename public routes.

---

## 5. Public surface — page-by-page spec

All public pages share a layout:

```
┌─────────────────────────────────────┐
│  Cinematic dark hero (full-bleed)   │
│  Eyebrow • Title • Subtitle • meta  │
├─────────────────────────────────────┤
│  Light surface (#F8FAFC)            │
│  ↑ content card overlaps -mt-12     │
│  …                                  │
│  Footer attribution (small, grey)   │
└─────────────────────────────────────┘
```

### 5.1 `/help` — Landing

**Goal:** the visitor decides "report new" or "track existing" within 3
seconds.

**Hero**
- Eyebrow: small live ice-blue dot (subtle ping animation) + `ERIDE SUPPORT`
- H1: **How can we help?**
- Subtitle: *Report an issue, track a ticket, and stay updated until
  resolution.*
- Tiny attribution chip: `· POWERED BY ERIDE DOGMA` (soft grey, never loud)

**Two action cards** (stacked on mobile, 2-up on `lg:`, overlap into hero)
- **Primary — Report a problem**
  - Dark Carbon card, ice-blue top hairline, `PRIMARY` pill,
    lifebuoy icon in ice-blue
  - CTA: `Start a report →` (arrow translates +1 on hover)
- **Secondary — Track an existing ticket**
  - White card, neutral search icon, `EXISTING` pill in steel grey
  - CTA: `Look up status →` (arrow turns ice-blue on hover)

**Trust strip** (single white card with graphite border)
- `Secure intake` — Encrypted submission
- `Tracked reference` — Unique ticket ID
- `Support follow-up` — Email or WhatsApp

**Product chips** (under `SUPPORTED PRODUCTS` micro-eyebrow)
- White pills, ice-blue dot prefix: **E-Migration Assist · 8Beauty · Eride**

**Footer**
- `Powered by Eride Dogma Support Centre` (left)
- `Structured support · Controlled resolution` (right, uppercase, soft grey)

### 5.2 `/help/report-problem` — Form

**Goal:** capture enough info to triage, with **zero unnecessary fields**.

**Hero:** "Report a Problem" + back link to /help.

**Form (single column, generous spacing):**

| Field                   | Type              | Required | Notes                                         |
| ----------------------- | ----------------- | -------- | --------------------------------------------- |
| Which product           | Select            | ✓        | Loaded from `/api/support/products`           |
| Your name               | Text              | ✓        |                                               |
| You are a…              | Select            | ✓        | See "Reporter type" enum below                |
| Email address           | Email             | ◐        | **Either email OR WhatsApp required**         |
| WhatsApp number         | Tel               | ◐        | E.164 format, helper text shows example       |
| What kind of issue      | Select            | ✓        | See "Category" enum below                     |
| Short summary           | Text (≤ 140 char) | ✓        | One sentence                                  |
| What happened           | Textarea          | ✓        | Multiline, no markdown                        |
| Steps to reproduce      | Textarea          | –        | Optional                                      |
| Attachment (1 file)     | File picker       | –        | Image/PDF, ≤ 10 MB; client + server validated |

**Submit button:** primary dark button, full-width on mobile.
**Validation:** inline error under each field; summary alert at top on submit
failure.
**Error surface:** `<Alert variant="destructive">` with a critical-red icon.

**Confirmation state** (post-submit):
- Hero changes to: "Thank you. Your issue has been received."
- Card with green check ring
- Show **ticket reference in mono** + a one-line "Save this reference."
- Two buttons: `Track this ticket` (primary) and `Report another` (outline)

### 5.3 `/help/track-ticket` — Lookup

- Hero: "Track your support ticket" + subtitle.
- Single card with three fields:
  - Ticket reference (with placeholder example, e.g. `ER1-SUP-2026-000123`)
  - Email *or* WhatsApp number
- Actions: `View ticket` (primary), `Back to Help` (outline).
- Footer microlink: "Don't have a reference? **Report a new problem.**"

### 5.4 `/help/ticket/:reference` — Verify + Ticket view

**Verify panel** (when no/expired access token):
- Hero: "Verify your ticket access" + a steel-grey chip showing the
  reference in mono
- Card: "Confirm it's you" — email *or* WhatsApp + `View ticket` CTA.

**Ticket view** (after verification):
- **Hero shows ONLY public information:**
  - Ticket reference (mono)
  - Subtitle: "Latest public status for your support request with
    {productName}."
  - Two pills: product (graphite chip), public status (ice-blue tinted pill)
- **Body cards (light surface):**
  - **Privacy notice** alert (`AlertTriangle`): "Anyone with this link and
    your contact can view this ticket. Don't share it publicly."
  - **Status timeline** — vertical list of public-visible message events
    (ticket received, under review, more info needed, fixed, resolved…)
    each with a timestamp, channel chip, and the public message body
  - **Reply form** — single textarea + optional attachment, primary `Send
    reply` button. Disabled when ticket status is `closed`.
  - **Reopen affordance** — only visible when `publicStatus ∈ {fixed,
    resolved}`. Confirmation modal before reopening.

---

## 6. Internal surface — page-by-page spec

### 6.1 `/admin/support/login`
- Centred card, dark background, form: email + password + sign-in button.
- "Eride Dogma Support Centre" wordmark visible.
- Forgot-password link (route handled by support).

### 6.2 `/admin/support/wallboard` (cinematic, TV-mode)
- Full-bleed `bg-[#050505]` dark surface.
- Header: eyebrow `Eride Dogma · Live Operations` (silver-mist), gradient
  bar, big H1 (e.g. "Operations").
- Grid of large stat tiles (Active tickets, Awaiting response, In
  engineering, Breached SLAs).
- Live ticket list with **public status only** in colour-coded rows.
- Auto-refresh indicator (subtle pulse).
- **No interactive elements** — pure display.

### 6.3 `/admin/support/tickets` — Queue
- Header with title, count, and right-aligned `New ticket` if applicable.
- **Filters bar** (sticky on desktop):
  - Search (free text)
  - Status (multi)
  - Product (multi)
  - Assignee
  - Severity / Priority
  - Date range (created from / created to)
  - SLA: on track / approaching / breached
- **Table columns:** Reference (mono) · Subject · Product · Reporter ·
  Status · SLA badge · Assignee · Updated.
- Row hover highlights; click → detail.
- Empty state: "No tickets match these filters."

### 6.4 `/admin/support/tickets/:id` — Detail
- **Left pane (2/3):**
  - Subject + reference (mono) + chips (status, product, severity, priority)
  - Conversation timeline (oldest → newest) with channel/type chips
  - Reply composer with template picker + attachment + send button
- **Right pane (1/3):**
  - Reporter card (name, contact, type, IP/UA if available)
  - Internal status selector (full enum, not just public)
  - Assignee picker
  - Severity / priority
  - SLA panel (phase, time remaining, breach badge — **internal only**)
  - Linear link / "Push to Linear" action
  - Internal notes (collapsible)
  - Audit log (read-only)

### 6.5 `/admin/support/templates`
- List of reply templates, search box, `+ New template`.
- Editor with subject, body (text), channel, type tag, default-yes flag.

### 6.6 `/admin/support/settings`
- Tabs: Org · Products · SLA · Email · WhatsApp · Linear · Sentry.
- Read-only secrets (never show values; only show "Set / Not set" + last
  rotated date).

---

## 7. Status taxonomies (use exact labels)

### 7.1 Public status (shown to customers)
`Received` · `Under review` · `More info needed` · `Being fixed` · `Fixed`
· `Resolved` · `Closed`

### 7.2 Internal status (admin only — never on public)
`New` · `Triage required` · `Support review` · `Needs user info` ·
`Engineering escalation required` · `Linear created` · `In engineering` ·
`In review` · `In QA verification` · `Fixed (awaiting notification)` ·
`User notified` · `Resolved` · `Closed` · `Duplicate` · `Not a bug` ·
`Deferred` · `Spam`

### 7.3 Severity
`Critical` · `Major` · `Moderate` · `Minor` · `Cosmetic`

### 7.4 Priority
`Urgent` · `High` · `Medium` · `Low`

### 7.5 SLA status (internal only)
On track · Due soon · Overdue · Paused · Met · Not started
- Colour: green / amber / red / slate / slate-light / muted respectively.

### 7.6 Categories (form)
Technical bug · Account or login issue · OTP / verification issue ·
Document upload issue · Application flow confusion · Payment issue ·
B2B firm admin issue · Consultant issue · Partner issue · Feature request
· Complaint · Data correction request · Security or privacy concern ·
Performance issue · System downtime · General support

### 7.7 Reporter types
Public visitor · Applicant · B2B firm admin · Consultant · Beauty client
· Beauty professional · Partner · Internal tester · Other

### 7.8 Message channels & types
- **Channels:** Email · WhatsApp · Phone · In-app · Manual · Internal note
- **Types:** Ticket received · Under review · More info needed · Escalated
  to engineering · Fixed · Resolved · Closed · Reopened · Custom · User
  reply · Internal update

---

## 8. Component library (design tokens)

### 8.1 Buttons

| Variant     | Background          | Text       | Border          | Hover                  | Use                  |
| ----------- | ------------------- | ---------- | --------------- | ---------------------- | -------------------- |
| `primary`   | `#0B0F14`           | white      | none            | `#050505`              | Main CTA             |
| `outline`   | `#FFFFFF`           | `#1F2933`  | `#CBD5E1`       | bg `#F8FAFC`           | Secondary CTA        |
| `ghost`     | transparent         | `#1F2933`  | none            | bg `#F1F5F9`           | Tertiary             |
| `destructive` | `#EF4444`         | white      | none            | darker red             | Destructive          |

- All buttons get a focus ring `ring-2 ring-[#38BDF8] ring-offset-2`.
- Min height `h-10` desktop, `h-11` mobile.

### 8.2 Cards
- **Light card:** white, `border-[#E5E7EB]`, `rounded-2xl`,
  `shadow-[0_12px_30px_-18px_rgba(11,15,20,0.25)]`.
- **Dark card (hero CTA):** `#0B0F14`, `border-[#1F2933]`, top hairline
  ice-blue gradient, soft right-corner ice-blue glow on hover.
- Optional left-edge gradient stripe on accent cards (`from-[#8FA1B5] to-
  [#5F7182]`, 3 px wide).

### 8.3 Badges & chips
- **Status pill (public):** rounded-full, `bg-[#8FA1B5]/10`, border
  `#8FA1B5/40`, text `#1F2933` (light) or `#B8C5D0` (dark).
- **Product chip:** white pill, hairline border, ice-blue dot prefix.
- **SLA badge:** see colour mapping above.
- **Mono reference chip:** Carbon background, gunmetal border, silver-white
  mono text.

### 8.4 Hero (public)
- Section: `bg-[#050505]` with layered radial gradients
  (`#1F2933` graphite pool top-right, `#38BDF8` ice glow @ 8%,
  `#5F7182` cool spill bottom-left).
- Bottom hairline: `from-transparent via-[#38BDF8]/50 to-transparent`.
- Eyebrow with optional live-dot pulse, optional back link in soft grey.

### 8.5 Forms
- Labels above inputs, `font-medium text-sm text-[#0B0F14]`.
- Inputs: `h-11`, `rounded-lg`, border `#CBD5E1`, focus ring ice-blue.
- Helper text: `text-xs text-[#94A3B8]` below the input.
- Error text: `text-xs text-[#EF4444]` with a small alert icon.
- Required marker: small red asterisk after the label.

### 8.6 Alerts
- Use 3 variants: `info` (graphite icon), `warning` (amber), `destructive`
  (red). Always include an icon + a clear, non-apologetic title.

### 8.7 Attachment uploader
- Single drop-zone tile with paperclip icon, accepted types, max size.
- Selected file: row with filename, size, remove (×).
- On error: red helper text below the tile.

### 8.8 Message thread (public + internal)
- Vertical list, oldest at top. Each item:
  - Left rail: small circular avatar / icon by direction
    (outbound = Eride mark, inbound = generic user, internal = lock icon)
  - Header: actor name · channel chip · type chip · relative time
  - Body: plain text, preserves line breaks
  - Footer (internal only): delivery status badge, attachment list

### 8.9 Status timeline (public ticket page)
- Same vertical list but **filtered to public-allowed events only**.
- Channel and type chips shown; **internal notes never appear**.

---

## 9. Privacy & content invariants (HARD RULES)

These rules **must not** be broken in any redesign:

1. **Public surfaces never show internal status.** Use only the 7 public
   status values from §7.1.
2. **Public surfaces never show SLA timers, breach badges, or phase.**
3. **Public surfaces never show internal notes** or messages whose channel
   is `internal_note` or whose direction is `internal`.
4. **Public surfaces never show:** assignee identity, Linear issue IDs,
   reporter IP/UA, severity/priority, or duplicate links.
5. **Customer-facing email/WhatsApp templates are signed "Eride Support"**
   — never "Eride Dogma" or any internal name.
6. **The "Dogma" wordmark may appear on public surfaces only as small
   footer attribution.** It must never appear as a heading, hero eyebrow,
   or button label on a public page.
7. **Do not surface raw IDs or UUIDs** on public pages — only the human
   reference (e.g. `ER1-SUP-2026-000123`) is shown.

---

## 10. Interaction states (every screen needs all four)

| State        | Treatment                                                                 |
| ------------ | ------------------------------------------------------------------------- |
| **Loading**  | Skeleton blocks, never a generic spinner alone. Hero stays rendered.      |
| **Empty**    | Icon + one-line title + one-line guidance + optional CTA.                 |
| **Error**    | Destructive alert at top of card with a clear "what to do next" message.  |
| **Success**  | Inline confirmation banner; navigate where useful.                        |

Submitting forms: button shows inline `Loader2` spin + "Submitting…", and
is disabled. Never block the entire screen.

---

## 11. Accessibility

- All interactive elements reachable by keyboard, with visible focus rings
  (ice-blue, 2 px, with offset).
- Colour contrast: WCAG AA minimum. Soft grey text (`#94A3B8`) is for
  decorative meta only — never use it for required information.
- Decorative SVGs marked `aria-hidden`; functional icons have an
  accessible name (label or `sr-only` text).
- Forms: every input has a `<label>`; errors are linked via `aria-
  describedby`; required fields use `aria-required="true"`.
- Live regions: status changes (e.g. "Reply sent") announced via
  `aria-live="polite"`.
- Reduced motion: hide pulses and translate animations under
  `@media (prefers-reduced-motion: reduce)`.
- Tap targets ≥ 44 × 44 px on mobile.

---

## 12. Responsive guardrails

| Breakpoint       | Behaviour                                                  |
| ---------------- | ---------------------------------------------------------- |
| `< 640 px`       | Single column, stacked cards, `px-5`, hero `py-16`         |
| `≥ 640 px (sm)`  | Padding bumps to `px-8`, hero `py-24`, two-col strips      |
| `≥ 1024 px (lg)` | Action cards 2-col grid, sticky filter bars on internal    |
| `≥ 1280 px (xl)` | Cap content at `max-w-5xl` (public) / `max-w-7xl` (admin)  |

Public surfaces must be perfectly usable down to **375 px** (iPhone SE).
Internal admin can require **1024 px+** but should degrade gracefully.

---

## 13. Microcopy library (use exactly)

- Landing H1: **How can we help?**
- Landing subtitle: *Report an issue, track a ticket, and stay updated
  until resolution.*
- Report button: **Report a problem**
- Track button: **Track an existing ticket**
- Confirmation H1: **Thank you. Your issue has been received.**
- Verify H1: **Verify your ticket access**
- Track H1: **Track your support ticket**
- Footer attribution: **Powered by Eride Dogma Support Centre**
- Footer tagline: **Structured support · Controlled resolution**

---

## 14. Out of scope (do not redesign)

- API contracts, route paths, ticket reference format
- Server-rendered email/WhatsApp template **markup** (UI for editing
  templates is in scope; the rendered customer message format is not)
- Authentication flows beyond the login screen
- Database schema and field names

---

## 15. Reference signals & moodboard

- **Material reference:** Pinarello Dogma road bike, matte black frame
  with steel-blue highlights, photographed in a dark studio.
  → translates to: matte Carbon backgrounds, steel-slate accents, single
  cool ice-blue light glint, no electric/neon flooding.
- **Tone references:** Linear (status), Stripe Dashboard (form clarity),
  Apple support (calm hierarchy), Vercel (dark hero with overlap).
- **Avoid:** SaaS pastels, gradient buttons, drop-shadowed emoji, playful
  illustration.

---

## 16. Deliverables expected from the designer

1. **Mobile-first wireframes** (375 px) for every public page in §5.
2. **Desktop layouts** (1280 px) for every public + internal page.
3. **Wallboard mock** at 1920 × 1080.
4. **Component sheet** showing all primitives in §8 with all four states
   from §10.
5. **Token export** (Figma variables / CSS custom properties) using the
   names in §3.2.
6. **Accessibility audit checklist** filled in against §11.

---

*End of brief — version 1.0. If anything in §9 is ambiguous, default to
"hide it from public" rather than "show it".*
