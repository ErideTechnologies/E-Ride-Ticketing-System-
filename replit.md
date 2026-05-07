# Eride Support Command Centre

Multi-tenant support and bug ticketing platform. MVP serves Eride Technologies; the data model is built so additional organisations can be onboarded later without restructuring.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/db run seed` — seed Eride org + active products (idempotent)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema (source of truth): `lib/db/src/schema/` — `enums.ts`, `organisations.ts`, `products.ts`, `tickets.ts`, `notes.ts` (internal notes + status history), `attachments.ts` (`support_ticket_attachments`, cascade delete with ticket), `messages.ts` (`support_ticket_messages`, cascade delete with ticket), `linearLinks.ts` (`support_ticket_linear_links`, one-row-per-ticket via UNIQUE on `support_ticket_id`, cascade delete with ticket), `sentryLinks.ts` (`support_ticket_sentry_links`, multiple-per-ticket, cascade delete with ticket)
- Attachment storage helper: `artifacts/api-server/src/lib/attachmentStorage.ts` (validation, magic-byte sniff, FS write/stream/remove). Files live under `./.local-storage/attachments/<ticketId>/<uuid>.<ext>` (override with `SUPPORT_ATTACHMENTS_DIR`); module is isolated to make swapping for S3/R2 a one-file change.
- Ticket reference helper: `lib/db/src/ticketReference.ts` (`generateSupportTicketReference`)
- Seed: `lib/db/src/seed.ts`
- API contract: `lib/api-spec/openapi.yaml`
- API server: `artifacts/api-server/src/`

## Architecture decisions

- Multi-tenant from day one: every domain table (`support_products`, `support_tickets`) carries `organisationId`; for MVP only Eride is seeded as active. No public SaaS onboarding/billing yet.
- UUID primary keys throughout (`uuid` + `defaultRandom()`) so org/product/ticket IDs are safe to expose externally and don't leak counts.
- Status, category, priority, severity are **Postgres enums** generated from a single TS source of truth (`schema/enums.ts`) — exported `as const` arrays double as runtime constants and TS unions.
- Ticket references (`PRODUCTCODE-SUP-YYYY-NNNNNN`) are allocated atomically via a `support_ticket_sequences` counter table scoped by `(organisationId, productId, year)`, using `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` so concurrent inserts can't collide.
- Sequences restart at 1 each calendar year per org+product.

## Product

- Public "Report a Problem" page at `/help/report-problem` (artifact `web`) backed by `POST /api/support/tickets` and `GET /api/support/products` (Eride org only).
- Internal admin dashboard at `/admin/support/tickets` backed by `GET /api/support/tickets` with filters (product, priority, public/internal status, category, source, reporter type, search, createdFrom/createdTo) and newest-first sort. No auth yet.
- Internal ticket detail page at `/admin/support/tickets/:id`: overview, reporter, editable issue/status/priority/severity/category/assignment fields, internal notes, status history, copy-ready customer message templates and developer handoff text. Backed by `GET/PATCH /api/support/tickets/:id`, `GET/POST /api/support/tickets/:id/notes`, `GET /api/support/tickets/:id/status-history`. PATCH writes a row to `support_ticket_status_history` whenever public or internal status changes, and stamps `resolvedAt`/`closedAt` when either status enters `resolved`/`closed`.
- Server suggests `priority`/`severity` from category (see `artifacts/api-server/src/routes/support.ts`); ticket created with `source=public_form`, `publicStatus=received`, `internalStatus=triage_required`.
- Attachments: optional file picker on the public form (ticket is created first, then file is uploaded; if upload fails the confirmation surfaces a non-blocking warning). Admin detail page has an Attachments card with upload, list, view, download (`?download=1`), and delete. Endpoints: `GET/POST /api/support/tickets/:id/attachments` and `GET/DELETE /api/support/tickets/:id/attachments/:attachmentId`. Allowed: PNG/JPG/WEBP ≤10MB, PDF ≤15MB, MP4/MOV ≤50MB. Server validates declared MIME + extension *and* sniffs magic bytes — spoofed files (e.g. text renamed to `.png`) are rejected.
- Engineering escalation card on `/admin/support/tickets/:id` backed by `GET/POST/DELETE /api/support/tickets/:id/linear-link`. Sections: readiness summary (priority/severity/category/internal status + counts of attachments/notes/Linear link, with "Ready for engineering" verdict for the 7 technical categories — `technical_bug`, `payment_issue`, `otp_verification_issue`, `document_upload_issue`, `performance_issue`, `system_downtime`, `security_privacy_concern`), Generate/Copy Linear Issue text (title `[Priority] [ProductCode] [Category] — [Summary]`, body includes attachment summary + compliance notes), Generate/Copy Replit Fix Prompt (interpolates the linked Linear key or "Not linked yet"), Linear link form (key required + URL/team/status/linked-by) with save/remove via upsert (`onConflictDoUpdate` keyed on `support_ticket_id`), and reminder text — "no link but `engineering_escalation_required`", "link exists", and "in_qa_verification" — shown only when the matching condition is true. No automatic status change on link save; user is nudged to apply `mark_in_engineering` from Workflow Actions.
- Workflow Actions card at the top of `/admin/support/tickets/:id` backed by `POST /api/support/tickets/:id/workflow-action`. 14 named actions in 4 visual groups (Support review, Engineering, Resolution, Admin outcomes); each click opens an inline confirm panel for optional name/reason then applies the public+internal status mapping, sets `resolvedAt` when entering `resolved` and `closedAt` when entering `closed`/`duplicate`/`spam` (only if not already set), and `reopen_ticket` clears `closedAt`. Every change writes a `support_ticket_status_history` row with `changeReason` prefixed `[<action>]`. Reminder text shown after `request_more_info`, `escalate_to_engineering`, `mark_fixed_waiting_notification`, `close_ticket` — never auto-sends communication.
- Communication log on `/admin/support/tickets/:id` (replaces the old "Communication drafts" card) backed by `GET/POST /api/support/tickets/:id/messages`. Three sections: quick templates (copy + "Record as sent manually" with channel choice → creates an outbound `sent_manual` message stamped with current public/internal status), manual entry form (direction/channel/messageType/deliveryStatus + sender/recipient + body, defaults from reporter), and a newest-first timeline of every message with direction/type/channel/status badges and colour-coded outbound/inbound/internal styling. Status-change suggestions are shown as helper text only — never auto-apply. No real email/WhatsApp sending yet.
- Live wallboard at `/admin/support/wallboard` (TV-friendly dark layout) backed by `GET /api/support/wallboard`. Shows summary KPIs, per-product breakdown for active Eride products, and three watchlists (urgent/high open, awaiting triage, fixed-waiting-user-notification — newest 10 each). Auto-refreshes every 60s via React Query; clock ticks each second client-side; ticket rows link to the detail page. Aggregation runs in-memory from a single `tickets ⨝ products` query.
- Real email notifications via Resend, DSN-gated on `RESEND_API_KEY` (defaults: `SUPPORT_EMAIL_FROM="Eride Support <support@eridetech.africa>"`, `SUPPORT_EMAIL_REPLY_TO="support@eridetech.africa"`). Helpers: `artifacts/api-server/src/lib/supportEmail.ts` (`sendSupportEmail`, `isSupportEmailEnabled`, `getSupportEmailFrom`, `getSupportEmailReplyTo`) returns `{success, provider, providerMessageId, errorMessage, disabled}` — when `RESEND_API_KEY` is unset all sends are no-ops with `disabled:true`. Templates: `artifacts/api-server/src/lib/supportEmailTemplates.ts` renders 8 keys (`ticket_received`, `under_review`, `more_info_needed`, `escalated_to_engineering`, `fixed`, `resolved`, `closed`, `reopened`) plus `renderCustomEmailHtml`; HTML-escaped with a footer warning ("do not reply with passwords, payment card details, or sensitive documents"). Templates *never* include internal status, internal notes, attachments, Linear/Sentry refs, or stack traces. Endpoint `POST /api/support/tickets/:id/send-email` (Eride-only via `loadErideTicket`) accepts `{messageType, sendMode: "template"|"custom", to?, subject?, bodyText?, senderName?}`; custom mode requires subject+body and *always* renders HTML server-side from `bodyText` (no caller HTML accepted). Send/log is two-phase: insert a `drafted` row in `support_ticket_messages` first, send via provider, then update with `deliveryStatus` (`sent_manual`/`failed`/`drafted` when disabled) + `providerMessageId`/`errorMessage` — guarantees no provider call without an audit row. Public ticket creation (`POST /support/tickets`) fires `sendTicketReceivedEmailIfPossible` non-blocking. Admin detail page has an Email Actions card (recipient/sender inputs, 8 template send-with-confirm buttons, custom email composer, outcome alert that surfaces "Email is not configured…" when disabled). Message timeline rows now also display `providerMessageId` and `errorMessage` when present. Schema: `support_ticket_messages` adds `providerMessageId`/`errorMessage` text columns.
- Sentry instrumentation: backend (`@sentry/node`) and frontend (`@sentry/react`) init are DSN-gated (`SENTRY_DSN` / `VITE_SENTRY_DSN_WEB`); both apply PII redaction (`beforeSend`/`beforeBreadcrumb`) over a SENSITIVE_KEYS set covering email/whatsapp/passwords/free-text fields, and the user object is reduced to `{id}` only — no replay, no auto-create-from-Sentry. React tree wrapped in `AppErrorBoundary` (fallback shows event id + Try again + Report a Problem). Smoke route `GET /api/_sentry-test` is gated on `NODE_ENV!=="production" || ENABLE_SENTRY_TEST_ENDPOINT==="true"`. Multiple Sentry refs per ticket via `support_ticket_sentry_links` (cascade delete with ticket, no unique constraint) — endpoints `GET/POST /api/support/tickets/:id/sentry-links` and `DELETE /api/support/tickets/:id/sentry-links/:sentryLinkId`. POST requires ≥1 of `sentryIssueId`/`sentryEventId`/`sentryUrl` (else 400). Admin detail page has a Sentry Links card (list with project/env/issueId/eventId/linkedBy/created + Open in Sentry + Delete; add form with helper "internal only"). The Replit fix prompt now appends `Sentry:\n{project} / {issueId|eventId|url}` lines after the Linear Issue line — never includes raw stack traces or event details.
- No Linear/WhatsApp/email sending/SaaS yet.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Orval generates `zod.date()` for `format: date-time` query params, but Express query values are strings. Date-range filters (`createdFrom`/`createdTo`) are parsed manually in `routes/support.ts` rather than via the generated schema.
- Orval names body Zod schemas after the **operation**, not the OpenAPI schema (e.g. `UpdateSupportTicketBody`, not `SupportTicketUpdate`). The matching TS interface uses the schema name and lives under `generated/types/`. Import the operation-named const for runtime validation.
- Postgres throws on invalid UUID casts. Always guard `:id` route params with a UUID regex before hitting the DB; otherwise an unknown path segment 500s instead of returning 404.
- Orval generates `zod.instanceof(File)` for multipart bodies. The api-zod tsconfig must include `"dom"` in `lib` so `File`/`Blob` types resolve. Reference multipart bodies via a named schema (`$ref`) instead of inlining — Orval names body schemas after the **operation** and inlining causes type collisions across endpoints.
- Attachment uploads must write the file *and* insert the DB row inside a try/catch that removes the file on any failure, otherwise a DB error leaves an orphan on disk. Magic-byte sniffing (`validateAttachmentContent`) runs *after* MIME/ext validation and *before* persisting.
- Email send/log must be two-phase: insert the `support_ticket_messages` row with `delivery_status='drafted'` *before* calling the provider, then update the row with the outcome. Sending first and logging after risks delivered emails with no audit trail and duplicate sends on retries. Custom-mode HTML must be rendered server-side from `bodyText`; never accept caller-supplied HTML — it bypasses escaping and the footer warning.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
