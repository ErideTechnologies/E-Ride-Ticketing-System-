# Eride Dogma Support Centre — Feature Overview

> **Structured support. Controlled resolution.**

Multi-tenant support and bug ticketing platform. MVP serves Eride Technologies; the data model is built so additional organisations can be onboarded later without restructuring.

## Branding & visual identity

- **Official internal product name:** Eride Dogma Support Centre
- **Tagline:** Structured support. Controlled resolution.
- **Wallboard / TV command centre name:** Dogma Command Centre (subtitle "Live support and resolution visibility across Eride products.")
- **Public-facing name:** Eride Support — used on `/help`, `/help/report-problem`, `/help/track-ticket`, `/help/ticket/:ref`, and in customer-facing email/WhatsApp templates. The "Dogma" identity is intentionally not surfaced to public users.
- **Visual identity:** matte black, graphite, gunmetal, steel blue-grey, with electric ice-blue accents. The light palette (public + internal admin) and the dark palette (wallboard) are defined in `artifacts/web/src/index.css`. Internal admin pages use a small uppercase eyebrow ("Eride Dogma Support Centre") with a thin ice-blue accent line above the page title — see the `.dogma-eyebrow` utility.
- Database tables (`support_tickets`, `support_products`, `support_ticket_messages`, etc.) and API routes (`/api/support/...`) are intentionally **not** renamed.

## Where things live

- **DB schema (source of truth):** `lib/db/src/schema/`
  - `enums.ts`, `organisations.ts`, `products.ts`, `tickets.ts`
  - `notes.ts` — internal notes + status history
  - `attachments.ts` — `support_ticket_attachments` (cascade delete with ticket)
  - `messages.ts` — `support_ticket_messages` (cascade delete with ticket)
  - `linearLinks.ts` — `support_ticket_linear_links` (one-row-per-ticket via UNIQUE on `support_ticket_id`)
  - `sentryLinks.ts` — `support_ticket_sentry_links` (multiple per ticket)
  - `auditLog.ts` — `support_ticket_audit_log`
  - `messageTemplates.ts`, `settings.ts`
- **Attachment storage helper:** `artifacts/api-server/src/lib/attachmentStorage.ts` — validation, magic-byte sniff, FS write/stream/remove. Files live under `./.local-storage/attachments/<ticketId>/<uuid>.<ext>` (override with `SUPPORT_ATTACHMENTS_DIR`); module is isolated to make swapping for S3/R2 a one-file change.
- **Ticket reference helper:** `lib/db/src/ticketReference.ts` — `generateSupportTicketReference`
- **Seed:** `lib/db/src/seed.ts`
- **API contract:** `lib/api-spec/openapi.yaml`
- **API server:** `artifacts/api-server/src/`
- **Web client:** `artifacts/web/src/`

## Architecture decisions

- **Multi-tenant from day one:** every domain table (`support_products`, `support_tickets`) carries `organisationId`; for MVP only Eride is seeded as active. No public SaaS onboarding/billing yet.
- **UUID primary keys throughout** (`uuid` + `defaultRandom()`) so org/product/ticket IDs are safe to expose externally and don't leak counts.
- **Status, category, priority, severity are Postgres enums** generated from a single TS source of truth (`schema/enums.ts`) — exported `as const` arrays double as runtime constants and TS unions.
- **Ticket references** (`PRODUCTCODE-SUP-YYYY-NNNNNN`) are allocated atomically via a `support_ticket_sequences` counter table scoped by `(organisationId, productId, year)`, using `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`. Sequences restart at 1 each calendar year per org+product.

## Public surface

- **Report a Problem** — `/help/report-problem` (web) → `POST /api/support/tickets`, `GET /api/support/products`. Optional file picker; ticket is created first, file uploaded second; upload failure surfaces a non-blocking warning.
- **Track ticket** — `/help/track-ticket` and `/help/ticket/:ticketReference`. Reporters look up by ticket reference + email or WhatsApp number; on match, the server returns a 30-min HMAC-SHA256 access token. Token held in `sessionStorage` (`eride.publicTicketToken:<REF>`).
- **Public endpoints** (intentionally NOT in OpenAPI; called via plain `fetch`):
  - `POST /support/public/verify-ticket`
  - `GET /support/public/tickets/:ref` — public-safe ticket only (reference, product, publicStatus, category, priority, summary, page/step, reporter name, timestamps)
  - `GET .../messages` — filters out `direction=internal`, `channel=internal_note`, and outbound messages whose deliveryStatus is not `sent_manual`/`received`
  - `POST .../reply` — creates inbound `in_app`/`user_reply`/`received` message; auto-reopens tickets where publicStatus ∈ {fixed, resolved, closed}
  - `POST .../attachments` — reuses multer + magic-byte validation, two-phase write/DB-insert with rollback
- All public endpoints accept the token via `Authorization: Bearer` header OR `?token=` query, and require the token's embedded ticketId to match the resolved ticket from the URL reference.
- **Public pages never render:** internalStatus, internal notes, Linear/Sentry/GitHub/Replit refs, providerMessageId, errorMessage, developer-handoff text, SLA fields.

## Internal surface

- **Tickets list** — `/admin/support/tickets` → `GET /api/support/tickets` with filters (product, priority, public/internal status, category, source, reporter type, search, createdFrom/createdTo, slaStatus, overdueOnly, dueSoonOnly).
- **Ticket detail** — `/admin/support/tickets/:id`. Backed by `GET/PATCH /api/support/tickets/:id`, `GET/POST /api/support/tickets/:id/notes`, `GET /api/support/tickets/:id/status-history`. PATCH writes a `support_ticket_status_history` row whenever public or internal status changes, and stamps `resolvedAt`/`closedAt` on terminal states.
- **Workflow Actions** — `POST /api/support/tickets/:id/workflow-action`. 14 named actions in 4 visual groups (Support review, Engineering, Resolution, Admin outcomes). Inline confirm panel for optional name/reason; applies status mapping; admin-outcome actions (`mark_spam`/`mark_duplicate`/`mark_not_a_bug`/`close_ticket`) require `manage_workflow_admin_outcomes` enforced in the route handler.
- **Communication log** — `GET/POST /api/support/tickets/:id/messages`. Quick templates (copy + "Record as sent manually"), manual entry form, and a newest-first timeline.
- **Email Actions** — Resend-backed via `sendSupportEmail` (DSN-gated on `RESEND_API_KEY`). 8 templates + custom email composer. Two-phase send/log: insert `drafted` row → call provider → update with outcome.
- **Engineering Escalation** — Generate/Copy Linear Issue text, Generate/Copy Replit Fix Prompt, Linear link form, Linear API creation subsection.
- **Linear API integration** — DSN-gated on `LINEAR_API_KEY`. Endpoints: `GET /api/support/integrations/linear/status` and `POST /api/support/tickets/:id/create-linear-issue` (Eride-only, refuses with 409 if a link already exists). Serialized per-ticket via `db.transaction` + `pg_advisory_xact_lock(hashtext(ticketId))`.
- **Sentry links** — `GET/POST /api/support/tickets/:id/sentry-links`, `DELETE .../sentry-links/:sentryLinkId`. Multiple refs per ticket. Replit fix prompt appends `Sentry:` lines after the Linear Issue line — never includes raw stack traces.
- **Attachments** — `GET/POST /api/support/tickets/:id/attachments`, `GET/DELETE .../attachments/:attachmentId`. Allowed: PNG/JPG/WEBP ≤10MB, PDF ≤15MB, MP4/MOV ≤50MB. MIME + extension + magic-byte sniff.
- **Wallboard** — `/admin/support/wallboard` (TV-friendly dark layout) → `GET /api/support/wallboard`. Auto-refreshes every 60s; ticket rows link to detail page.
- **Templates + Settings** (admin-only) — `/admin/support/templates`, `/admin/support/settings` → `GET/PATCH /api/support/settings`, `GET/PATCH /api/support/templates`, `POST /api/support/templates/preview`. HTML bodies validated by `isSafeTemplateHtml` (rejects `<script>`, `<iframe>`, `on*=`, `javascript:`); preview iframe uses `sandbox=""`.
- **SLA tracking** — pure-function calculator at `artifacts/api-server/src/lib/sla.ts`. Two phases: support_review (anchor=createdAt; targets urgent=30m / high=2h / medium=8h / low=48h) and engineering_fix (anchor=first status-history transition into engineering states; targets urgent=4h / high=24h / medium=168h / low=336h). Computed dynamically at read time.
- **Audit log** — every major mutation writes a `support_ticket_audit_log` row via `recordSupportAuditLog` (`supportAudit.ts`). Audit failures never break user requests.

## Authentication & roles

- **6 roles:** `support_admin`, `support_agent`, `product_owner`, `developer`, `qa_verifier`, `viewer`.
- **11 permissions:** see `artifacts/api-server/src/lib/supportAuth.ts` and the mirror in `artifacts/web/src/lib/supportAuth.ts`.
- **Login model:** shared `SUPPORT_AUTH_PASSWORD` + email-must-be-listed in one of the role-specific allowlists (`SUPPORT_<ROLE>_EMAILS`).
- **Sessions:** HMAC-signed cookies (`support_auth`, HttpOnly, SameSite=Lax, 12h TTL, Secure in production).
- **Server guards:**
  - `supportAuthGuard` — rejects all `/support/*` requests without a session except a public whitelist (`POST /support/tickets`, `GET /support/products`, `/support/public/*`, `/support/auth/*`, `/_sentry-test`, `/healthz`).
  - `supportPermissionGuard` — declarative method+path → permission map for all sensitive routes.
- **Frontend:** `SupportAuthProvider` + `useSupportAuth`; `RequireSupportAuth` wraps every `/admin/support/*` route; Templates+Settings additionally require `support_admin`; ticket detail shows a read-only banner when the user lacks `edit_ticket`.

## Sentry instrumentation

- Backend (`@sentry/node`) and frontend (`@sentry/react`) init are DSN-gated.
- Both apply PII redaction (`beforeSend`/`beforeBreadcrumb`) over a SENSITIVE_KEYS set; user object is reduced to `{id}` only.
- React tree wrapped in `AppErrorBoundary` (fallback shows event id + Try again + Report a Problem).
- No replay, no auto-create-ticket-from-Sentry.

## Out of scope (MVP)

- WhatsApp inbound/outbound automation
- GitHub PR automation
- External-company SaaS onboarding & billing
- File storage to S3/R2 (helper is isolated for swap, but the FS implementation ships with MVP)
