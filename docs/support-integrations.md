# Integrations

The Eride Dogma Support Centre depends on a small set of external services. This doc explains what each integration does, what env vars it needs, what happens when it isn't configured, and how to verify it from the admin Integrations page.

The matching env-var reference is `docs/support-env-vars.md`.

## Where to verify

- Sign in as a `support_admin` (any email in `SUPPORT_ADMIN_EMAILS`).
- Open `/admin/support/integrations`. Each integration is rendered as a card with a status chip:
  - **Configured** — green; required env vars are set and the integration is fully wired.
  - **Fallback** — amber; degraded but safe (e.g. email is sending but using `SESSION_SECRET` for token signing).
  - **Manual** — amber; provider is intentionally in human-only mode (e.g. WhatsApp manual).
  - **Not configured** — red; the integration is off and the platform falls back to a documented behaviour.

The page never displays secret values — only `set` / `not set` for every env var and safe defaults like the email From address.

## Internal authentication

- **What it does:** gates `/admin/support/*` and the `/support/*` API behind a shared password + per-role email allow-list.
- **Required env vars:** `SUPPORT_AUTH_PASSWORD`, plus at least one role list (e.g. `SUPPORT_ADMIN_EMAILS`).
- **Optional:** `SUPPORT_AUTH_SECRET` (independent session-cookie HMAC key — set this in production so rotating it can force-logout everyone).
- **Fallback:** if `SUPPORT_AUTH_SECRET` is unset, sessions are signed with `SESSION_SECRET`. If both are unset, a logged dev-only fallback is used.

## Public ticket security

- **What it does:** signs the 30-minute access tokens used by `/help/track-ticket` and `/help/ticket/:ref`.
- **Required env vars:** `SUPPORT_PUBLIC_TICKET_SECRET`.
- **Fallback:** falls back to `SESSION_SECRET`, then to a dev-only fallback (logged once). Always set this in production so rotating it can invalidate stale links.

## Email (Resend)

- **What it does:** sends template + custom emails for ticket lifecycle events.
- **Required env vars:** `RESEND_API_KEY`.
- **Optional:** `SUPPORT_EMAIL_FROM`, `SUPPORT_EMAIL_REPLY_TO`.
- **Fallback:** when `RESEND_API_KEY` is unset, every send returns `{ disabled: true }`, a `drafted` row is still written for audit, and the admin UI shows a disabled-mode banner.
- **Verify:** open `/admin/support/integrations` → Email card → **Send test email**. Defaults to the calling admin's email; the response shows the provider message id on success or `disabled:true` when unset. Audit log gets an `integration.email_test` row either way.

## Sentry

- **What it does:** backend + frontend error reporting with PII redaction.
- **Required env vars:** `SENTRY_DSN_API` (backend) and `VITE_SENTRY_DSN_WEB` (frontend, baked in at build time).
- **Optional:** `ENABLE_SENTRY_TEST_ENDPOINT` (one-off prod verification — disable again afterwards).
- **Fallback:** when DSNs are unset, Sentry init is skipped — no events leave the server.
- **Verify:** the integrations card shows separate booleans for backend + frontend. If `ENABLE_SENTRY_TEST_ENDPOINT` is true, a destructive-styled alert reminds you to disable it.

## Linear

- **What it does:** creates Linear issues for engineering escalations and saves the link back to the ticket.
- **Required env vars:** `LINEAR_API_KEY` plus at least one team mapping (`LINEAR_TEAM_ID_<PRODUCT>` or `LINEAR_DEFAULT_TEAM_ID`).
- **Fallback:** when not configured, the engineering escalation card switches to copy/paste mode and admins can save the link manually.
- **Verify:** the integrations card shows per-product configured booleans. The dedicated `GET /api/support/integrations/linear/status` endpoint is also still used by the ticket detail UI.

## WhatsApp

- **What it does:** abstraction for outbound WhatsApp delivery. Today every concrete provider is in "prepared but not wired" mode — a real send always returns `disabled:true` so the audit trail stays honest.
- **Required env vars:** `WHATSAPP_PROVIDER` (one of `none`, `manual`, `meta_cloud_api`, `twilio`). Each non-trivial provider has its own required vars (see `docs/support-env-vars.md` § WhatsApp).
- **Fallback:** when `WHATSAPP_PROVIDER` is `none` or `manual`, or when the chosen provider is missing required vars, the system records the action as manual instead of crashing.
- **Verify:** the integrations card shows the chosen provider, manual-mode flag, and which provider env vars are set. Webhook signature verification is wired but always returns `false` until a real provider is wired, so unsigned/spoofed webhooks are rejected.

## Attachment storage

- **What it does:** persists ticket attachments on local disk.
- **Required env vars:** none (works out of the box for dev).
- **Optional:** `SUPPORT_ATTACHMENTS_DIR` to point at a mounted volume.
- **Fallback:** defaults to `./.local-storage/attachments`. The integrations card surfaces only the last path segment (never the absolute path) and shows a warning when the local fallback is in use.

## Adding a new integration

1. Add a status helper in `artifacts/api-server/src/lib/integrationStatus.ts` returning a card with `requiredEnvVars`, `optionalEnvVars`, and **non-secret** `details` only.
2. Add a row to the matching section in `docs/support-env-vars.md` and `docs/support-integrations.md`.
3. If the integration sends user-visible output, add a one-off test action behind `manage_settings` in `routes/support.ts` and wire a panel into `admin-integrations.tsx`. Never accept caller-supplied HTML; render it server-side.
4. Update `docs/support-launch-checklist.md` § 14 with the new card's expected verification steps.
