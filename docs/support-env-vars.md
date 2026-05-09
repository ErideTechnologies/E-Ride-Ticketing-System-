# Environment Variables

All variables are managed via Replit Secrets. Never commit them to git.

## Always required

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. |
| `SESSION_SECRET` | Fallback HMAC secret for both internal sessions and public-ticket tokens. |

## Internal authentication (Step 16)

Login model is shared password + email-must-be-in-role-allowlist.

| Variable | Required? | Purpose |
| --- | --- | --- |
| `SUPPORT_AUTH_PASSWORD` | Yes | Shared internal sign-in password. Without this, `POST /support/auth/login` returns 503. |
| `SUPPORT_ADMIN_EMAILS` | At least one role list | Comma- or whitespace-separated list of admin emails. |
| `SUPPORT_AGENT_EMAILS` | "" | Support agent emails. |
| `SUPPORT_PRODUCT_OWNER_EMAILS` | "" | Product owner emails. |
| `SUPPORT_DEVELOPER_EMAILS` | "" | Developer emails. |
| `SUPPORT_QA_EMAILS` | "" | QA verifier emails. |
| `SUPPORT_VIEWER_EMAILS` | "" | Read-only viewer emails. |
| `SUPPORT_AUTH_SECRET` | Optional | HMAC secret for `support_auth` cookies. Falls back to `SESSION_SECRET`, then a logged dev fallback. **Set this in production.** Rotating it force-logs-out everyone. |

Email matching is case-insensitive; an email present in multiple lists resolves to the highest-privilege role in this order: admin → agent → product_owner → developer → qa_verifier → viewer.

## Email (Resend)

| Variable | Required? | Purpose |
| --- | --- | --- |
| `RESEND_API_KEY` | Optional | When unset, all email sends are no-ops with `disabled:true` and a `drafted` row is still written for audit. |
| `SUPPORT_EMAIL_FROM` | Optional | Default: `Eride Support <support@eridetech.africa>`. |
| `SUPPORT_EMAIL_REPLY_TO` | Optional | Default: `support@eridetech.africa`. |

## Public ticket tracking

| Variable | Required? | Purpose |
| --- | --- | --- |
| `SUPPORT_PUBLIC_TICKET_SECRET` | Recommended | HMAC secret for the 30-min public access token. Falls back to `SESSION_SECRET`, then a dev-only fallback that logs once. **Set this in production.** |

## Sentry

| Variable | Required? | Purpose |
| --- | --- | --- |
| `SENTRY_DSN_API` | Optional | Backend Sentry DSN. When unset, backend Sentry init is skipped. |
| `VITE_SENTRY_DSN_WEB` | Optional | Frontend Sentry DSN (built into the web bundle at build time). When unset, frontend Sentry init is skipped. |
| `ENABLE_SENTRY_TEST_ENDPOINT` | Optional | Set to `"true"` to enable `GET /api/_sentry-test` in production. Auto-enabled when `NODE_ENV !== "production"`. |

## Linear

| Variable | Required? | Purpose |
| --- | --- | --- |
| `LINEAR_API_KEY` | Optional | Linear personal API key. When unset, the Engineering Escalation card falls back to copy/paste mode. |
| `LINEAR_TEAM_ID_EMA` | Optional | Linear team UUID for the Eride Mobile App product. |
| `LINEAR_TEAM_ID_8BT` | Optional | Linear team UUID for the 8BT product. |
| `LINEAR_TEAM_ID_ERD` | Optional | Linear team UUID for the Eride product. |
| `LINEAR_DEFAULT_TEAM_ID` | Optional | Linear team UUID used when no per-product team is mapped. |

Resolution precedence: explicit override in request body → product-code env var → `LINEAR_DEFAULT_TEAM_ID`.

## WhatsApp

The WhatsApp abstraction never crashes when nothing is configured — it falls back to "manual" mode where agents send messages from their own device and the system only logs the action.

| Variable | Required? | Purpose |
| --- | --- | --- |
| `WHATSAPP_PROVIDER` | Optional | One of `none`, `manual`, `meta_cloud_api`, `twilio`. Default: `none`. |
| `WHATSAPP_ACCESS_TOKEN` | Required for `meta_cloud_api` | Meta Cloud API access token. |
| `WHATSAPP_PHONE_NUMBER_ID` | Required for `meta_cloud_api` | Meta Cloud API phone number id. |
| `WHATSAPP_FROM_NUMBER` | Required for `meta_cloud_api` | Outbound number in E.164 form. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Optional | Meta WABA id (used by some webhook flows). |
| `WHATSAPP_VERIFY_TOKEN` | Optional | Token Meta echoes back during webhook subscription. |
| `WHATSAPP_WEBHOOK_SECRET` | Optional | Signing key used to verify inbound webhooks. Without it, signed-only verification returns `false` and unsigned hooks are rejected. |
| `TWILIO_ACCOUNT_SID` | Required for `twilio` | Twilio account SID. |
| `TWILIO_AUTH_TOKEN` | Required for `twilio` | Twilio auth token. |
| `TWILIO_WHATSAPP_FROM` | Required for `twilio` | Outbound WhatsApp sender. Plain E.164 (e.g. `+14155238886`) or `whatsapp:+...` — both are accepted. Falls back to `WHATSAPP_FROM_NUMBER` if unset. |

`twilio` is wired end-to-end — outbound sends call Twilio's REST API and record the returned message SID. `meta_cloud_api` is prepared but not wired yet, so it falls back to recording sends as manual.

## Attachments

| Variable | Required? | Purpose |
| --- | --- | --- |
| `SUPPORT_ATTACHMENTS_DIR` | Optional | Override the on-disk attachments directory. Default: `./.local-storage/attachments`. Swap to a mounted volume in production. |

## Frontend dev/test

| Variable | Required? | Purpose |
| --- | --- | --- |
| `VITE_ENABLE_BOUNDARY_TEST` | Optional | Set to `"true"` at build time to mount `/__boundary-test` in a production build. Default: route only mounted in dev mode. |

## Production checklist

- [ ] `DATABASE_URL` set
- [ ] `SESSION_SECRET` set (long random string)
- [ ] `SUPPORT_AUTH_PASSWORD` set
- [ ] At least one `SUPPORT_*_EMAILS` populated with at least one admin email
- [ ] `SUPPORT_AUTH_SECRET` set (independent from `SESSION_SECRET`)
- [ ] `SUPPORT_PUBLIC_TICKET_SECRET` set
- [ ] `RESEND_API_KEY` set (or accept disabled-mode email)
- [ ] `SENTRY_DSN_API` + `VITE_SENTRY_DSN_WEB` set (or accept no error reporting)
- [ ] `LINEAR_API_KEY` + `LINEAR_DEFAULT_TEAM_ID` set (or accept manual escalation)
- [ ] `SUPPORT_ATTACHMENTS_DIR` points at a persistent volume
- [ ] `WHATSAPP_PROVIDER` set explicitly (`manual` is OK)
- [ ] `ENABLE_SENTRY_TEST_ENDPOINT` is **not** set (or only temporarily for verification)
- [ ] `support_admin` has visited `/admin/support/integrations` and every card shows the expected state
