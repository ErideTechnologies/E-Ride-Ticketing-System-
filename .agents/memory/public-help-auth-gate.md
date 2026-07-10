---
name: Public /help auth gate vs open ticket API
description: Why the /help web surfaces are login-gated but the ticket-create API stays public
---

# The /help surfaces are login-gated, but the ticket API must stay open

The public web surfaces (`/help`, `/help/report-problem`, `/help/report-problem/confirmation`, `/help/track-ticket`, `/help/ticket/:ref`) are wrapped in a frontend auth gate that reuses the existing support-auth session (work email + `SUPPORT_AUTH_PASSWORD`, same as the admin dashboard). Unauthenticated visitors see an "Eride Support"-branded sign-in screen instead.

**Do NOT also lock down the backend public endpoints** `POST /support/tickets` and `GET /support/products`.

**Why:** a separate external Replit app (E-Migration Assist, immigrationassist.replit.app) posts tickets directly to `POST /api/support/tickets` via the public API (open CORS, no key). Gating those backend routes would break that cross-app integration. The gate is UI-only by design.

**How to apply:** if asked to "secure the ticketing system" or "require login everywhere," keep the two public API endpoints open unless the external integration is being retired. The auth requirement lives at the web-router level (`PublicLoginGate` around `/help*` routes), not in the API auth whitelist.

## Reporter (ticket-logging user) account

A dedicated non-admin sign-in exists for logging tickets: email `user@eride.co.za` (in `SUPPORT_REPORTER_EMAILS`, a shared env var — the other role email lists are secrets) + the `SUPPORT_REPORTER_PASSWORD` secret (user-chosen; never read/display it).

**Why:** the user wanted to sign in "as a user" rather than admin. Note the highest-privilege role wins when an email appears in multiple lists, so an admin email cannot double as a reporter — a distinct email is required.
