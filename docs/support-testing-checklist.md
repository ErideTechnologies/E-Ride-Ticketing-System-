# Manual QA Checklist

Run before each significant release.

## 1. Public — Report a Problem

- [ ] Visit `/help/report-problem` unauthenticated.
- [ ] Product dropdown shows only active Eride products.
- [ ] Submit a ticket with all required fields → receive a ticket reference like `EMA-SUP-2026-000123`.
- [ ] Attach a small PNG (<10MB) → upload succeeds.
- [ ] Attach a `.txt` file renamed to `.png` → upload rejected with a sensible error.
- [ ] Attach a 12MB PNG → upload rejected with size error.
- [ ] Submit without selecting a product → form prevents submission with inline error.

## 2. Public — Track a Ticket

- [ ] Visit `/help/track-ticket` unauthenticated.
- [ ] Enter ticket reference + the email used at creation → access granted.
- [ ] Enter ticket reference + a wrong email → "Could not verify" (no leak about whether ticket exists).
- [ ] Enter ticket reference + WhatsApp number used at creation → access granted.
- [ ] On `/help/ticket/:ref`:
  - [ ] Public-safe ticket fields visible (reference, product, public status, category, priority, summary, page/step, reporter name, timestamps).
  - [ ] **Not visible:** internal status, internal notes, Linear/Sentry refs, SLA badges, providerMessageId, errorMessage, developer handoff text.
- [ ] Reply to ticket → message appears in timeline; ticket auto-reopens if it was fixed/resolved/closed.
- [ ] Upload an attachment from public page → succeeds, appears in admin Attachments card.
- [ ] Wait 30+ minutes, refresh → access expired; re-verify works.
- [ ] Manually paste another ticket's token into URL → server rejects (token's embedded ticketId must match URL ref).

## 3. Internal — Login & Roles

- [ ] Visit `/admin/support/tickets` unauthenticated → redirected to `/admin/support/login`.
- [ ] Login with admin email + correct password → land on `/admin/support/tickets`.
- [ ] Login with email not in any `SUPPORT_*_EMAILS` → 401, error shown.
- [ ] Login with wrong password → 401, error shown.
- [ ] Login when `SUPPORT_AUTH_PASSWORD` is unset → 503 with "Internal sign-in is not configured".
- [ ] Sign out via header pill → cookie cleared, redirected to login.
- [ ] **As `support_admin`:** see Templates and Settings buttons in tickets header; access both pages.
- [ ] **As `support_agent`:** Templates/Settings buttons hidden; visiting URLs directly redirects/blocks.
- [ ] **As `viewer`:** ticket detail shows read-only banner; PATCH attempts return 403.
- [ ] **As any non-admin role:** workflow action `mark_spam` returns 403 from server; UI may show button but server blocks.

## 4. Internal — Ticket lifecycle

- [ ] Open a triage_required ticket; click **Mark in support review** → status updates, history row added.
- [ ] PATCH priority/severity/category → updates persist; status-history row added if status changed.
- [ ] Add an internal note → appears in Notes card; written to audit log.
- [ ] Record a manual communication → appears in Communication Log timeline.
- [ ] Send an email template:
  - [ ] With `RESEND_API_KEY` set → message row deliveryStatus=`sent_manual`, providerMessageId populated.
  - [ ] Without `RESEND_API_KEY` → message row deliveryStatus=`drafted`, alert says "Email is not configured…".
- [ ] Send a custom email with `<script>` in bodyText → server escapes; rendered HTML shows literal text.
- [ ] Workflow Actions: `request_more_info` → SLA shows `paused` on detail page; `escalate_to_engineering` → engineering SLA starts.
- [ ] Engineering Escalation: Generate Linear text → Copy → contains priority, product code, category, summary.
- [ ] Click **Create Linear Issue** with `LINEAR_API_KEY` set:
  - [ ] First click succeeds → link saved, internal message added, status bumped to `linear_created` if eligible.
  - [ ] Second click → 409 "Linear issue already exists for this ticket".
- [ ] Add Sentry link with at least one of issueId/eventId/URL → appears in Sentry Links card; appears in Replit fix prompt.
- [ ] Workflow Actions: `mark_in_engineering` → `mark_fixed_waiting_notification` → `mark_verified_ready_to_notify_user` → resolved.
- [ ] Reopen ticket → `closedAt` cleared.

## 5. Wallboard

- [ ] `/admin/support/wallboard` requires login.
- [ ] Renders cleanly on 1920×1080.
- [ ] Auto-refreshes every 60s (watch the clock).
- [ ] SLA breached / approaching breach watchlists populate when there are matching tickets.
- [ ] Ticket rows link to `/admin/support/tickets/:id`.

## 6. Privacy spot-checks

For each public endpoint, run `curl` and grep the response for the forbidden tokens:

```bash
TOKEN=...   # from POST /support/public/verify-ticket
REF=EMA-SUP-2026-000001

curl -s "http://localhost:80/api/support/public/tickets/$REF?token=$TOKEN" | \
  grep -Ei 'internalStatus|sla|linear|sentry|providerMessageId|errorMessage|stack' \
  && echo "LEAK!" || echo "Clean"

curl -s "http://localhost:80/api/support/public/tickets/$REF/messages?token=$TOKEN" | \
  grep -Ei 'deliveryStatus|providerMessageId|errorMessage|internalStatus' \
  && echo "LEAK!" || echo "Clean"
```

## 7. Test endpoints

- [ ] In production build: `GET /api/_sentry-test` returns 404.
- [ ] In production build: visiting `/__boundary-test` returns NotFound (route not mounted).
- [ ] In dev / with `ENABLE_SENTRY_TEST_ENDPOINT=true`: `/api/_sentry-test` triggers a Sentry event.

## 8. Backend smoke

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:80/api/healthz                 # → 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:80/api/support/products        # → 200 (whitelisted)
curl -s -o /dev/null -w "%{http_code}" http://localhost:80/api/support/tickets         # → 401 unauth
curl -s -o /dev/null -w "%{http_code}" http://localhost:80/api/support/settings        # → 401 unauth
curl -s -o /dev/null -w "%{http_code}" http://localhost:80/api/support/templates       # → 401 unauth
curl -s -o /dev/null -w "%{http_code}" http://localhost:80/api/support/auth/me         # → 200 with {authenticated:false}
```
