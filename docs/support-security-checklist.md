# Security & Privacy Checklist

The MVP enforces a strict separation between **internal** triage data and **public** reporter-visible data. This document is the authoritative list of what must never leak.

## Public response privacy invariants

The following fields **MUST NOT** appear in any `/support/public/*` response, public page render, or outbound email body:

- `internalStatus`
- Internal notes (`support_ticket_notes`)
- SLA fields (`sla`, `slaStatus`, `slaDueAt`, `slaPhase`, `slaLabel`, `slaBreachedAt`, `minutesUntilDue`, `overdueMinutes`, `targetMinutes`)
- Linear refs (`linearIssueKey`, `linearIssueUrl`, `linearTeam`, `linearStatus`, `linkedBy`)
- Sentry refs (`sentryIssueId`, `sentryEventId`, `sentryUrl`, `sentryProject`, `sentryEnvironment`)
- GitHub / Replit refs of any kind
- `providerMessageId`, `errorMessage`
- Internal assigned user IDs / emails
- Developer handoff text / Replit fix prompt
- Raw stack traces
- Audit log rows
- Status-history `changeReason` strings (they are prefixed `[<workflow_action>]` and may contain triage notes)

### Where these are enforced

- **`serializePublicTicket` (support.ts):** returns only `ticketReference`, `productName`, `productCode`, `publicStatus`, `category`, `priority`, `issueSummary`, `pageOrStep`, `reporterName`, `createdAt`, `updatedAt`, `resolvedAt`, `closedAt`. **Never add SLA, internalStatus, or refs to this serializer.**
- **`serializePublicMessage` (support.ts):** returns only `id`, `direction`, `channel`, `messageType`, `senderName`, `messageBody`, `createdAt`. **Never add `deliveryStatus`, `providerMessageId`, or `errorMessage`.**
- **Public messages query** filters out `direction=internal`, `channel=internal_note`, and outbound messages whose `deliveryStatus` is not `sent_manual`/`received` — so `drafted` and `failed` rows never leak.
- **Email templates** (`supportEmailTemplates.ts`) are static and audited. Custom-mode email is rendered server-side from caller-supplied **plain text** only — caller HTML is never accepted.

## Authentication & authorization

### Server-side guards

- **`supportAuthGuard`** rejects all `/support/*` requests without a valid session cookie except this whitelist:
  - `POST /support/tickets` (public ticket creation)
  - `GET /support/products`
  - `/support/public/*`
  - `/support/auth/*`
  - `GET /_sentry-test` (gated separately on `NODE_ENV` / `ENABLE_SENTRY_TEST_ENDPOINT`)
  - `GET /healthz`
- **`supportPermissionGuard`** maps method+path → required permission for all sensitive routes (settings, templates, ticket PATCH, notes, messages, attachments, workflow-action, Linear/Sentry mutations, email send).
- **Admin-outcome workflow actions** (`mark_spam`, `mark_duplicate`, `mark_not_a_bug`, `close_ticket`) require `manage_workflow_admin_outcomes` enforced inside the route handler — non-admin roles with `manage_workflow` cannot push tickets into terminal admin states.
- **Reads on settings/templates** require `manage_settings` / `manage_templates` — non-admin roles cannot read internal config.

### Path-matching gotcha

Both guards work against the **router-relative path** (without the `/api` mount prefix). A rule like `"/api/support/..."` will silently never match. Always write rules as `"/support/..."`.

### Session cookies

- Name: `support_auth`
- Flags: `HttpOnly`, `SameSite=Lax`, `Secure` (in production)
- TTL: 12 hours
- Signed: HMAC-SHA256 over `email|name|role|exp` with `SUPPORT_AUTH_SECRET` (falls back to `SESSION_SECRET`, then a logged dev fallback)
- Verified with `timingSafeEqual`

### Public ticket tokens

- Format: `ticketId.exp.hexSig`
- TTL: 30 min (configurable via Settings → token TTL minutes; bounds 5–1440)
- Signed: HMAC-SHA256 with `SUPPORT_PUBLIC_TICKET_SECRET` (falls back to `SESSION_SECRET`, then a dev-only fallback that logs once via `logger.warn`)
- Accepted via `Authorization: Bearer` header OR `?token=` query
- Server **always** verifies the token's embedded ticketId matches the resolved ticket from the URL reference (defends against token re-use across tickets)

## Attachment security

- **Allowed types:** PNG, JPG, JPEG, WEBP (≤10MB), PDF (≤15MB), MP4, MOV (≤50MB)
- **Validation order:** declared MIME → declared extension → magic-byte sniff (`validateAttachmentContent`)
- **Spoofing defense:** a text file renamed to `.png` is rejected at the magic-byte step
- **Two-phase persist:** file write → DB insert inside a try/catch that removes the file on any failure (no orphan files)
- **Direct paths never exposed:** files are streamed via `GET /api/support/tickets/:id/attachments/:attachmentId` and scoped to the ticket — cross-ticket attachment access by ID is blocked
- **Public uploads:** `POST /support/public/tickets/:ref/attachments` requires a valid public ticket token; `uploadedByRole=public_user`
- **Admin uploads + deletes:** require `manage_attachments`

## Email safety

- All templates are HTML-escaped and include a footer warning ("do not reply with passwords, payment card details, or sensitive documents").
- Templates **never include**: internal status, internal notes, attachments, Linear/Sentry refs, stack traces, or fix prompts.
- Custom-mode email accepts only plain `bodyText` from the caller; HTML is rendered server-side. **Never accept caller HTML.**
- Send/log is two-phase: insert `drafted` row → call provider → update with outcome + `providerMessageId` / `errorMessage`. Guarantees no provider call without an audit row, and no duplicate sends on retries.
- When `RESEND_API_KEY` is unset, sends are no-ops with `disabled:true` and the row stays `drafted` — no crash.

## Linear / Sentry safety

- **No automatic Linear issue per ticket** — only via explicit admin action.
- **Duplicate prevention** — `POST /create-linear-issue` is serialized per-ticket via `db.transaction` + `pg_advisory_xact_lock(hashtext(ticketId))`; a second concurrent call blocks until the first commits.
- **Linear/Sentry refs** never appear on public pages or in email bodies.
- **PII redaction** — Sentry `beforeSend` / `beforeBreadcrumb` strip a SENSITIVE_KEYS set (email/whatsapp/passwords/free-text fields); user object is reduced to `{id}` only; no replay.
- **Replit fix prompt** appends `Sentry: {project} / {issueId|eventId|url}` lines — never the raw event payload or stack trace.

## Test endpoints

- **`GET /api/_sentry-test`** — gated on `NODE_ENV !== "production"` OR `ENABLE_SENTRY_TEST_ENDPOINT === "true"`.
- **`/__boundary-test`** (web) — only mounted when `import.meta.env.MODE !== "production"` OR `VITE_ENABLE_BOUNDARY_TEST === "true"` at build time.
- Both must remain disabled in production unless intentionally verifying Sentry capture.

## Audit log

- `support_ticket_audit_log` records every major mutation (ticket update, workflow action, notes, messages, attachments, Sentry/Linear links, Linear issue create, email send, settings/template updates, login/logout).
- `recordSupportAuditLog` swallows errors — audit failures never break the user request.
- Audit rows are **internal only** and never returned by any public route.
