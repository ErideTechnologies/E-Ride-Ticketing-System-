# Launch Checklist

Final go-live checks for the **Eride Dogma Support Centre** (public users see "Eride Support" on `/help/*` pages; the wallboard surfaces as "Dogma Command Centre"). Run top-to-bottom before flipping the production switch.

## 1. Admin secrets configured

- [ ] `DATABASE_URL` set to the production Postgres.
- [ ] `SESSION_SECRET` set (long random string, not the dev value).
- [ ] `SUPPORT_AUTH_PASSWORD` set and shared with the team via secure channel.
- [ ] `SUPPORT_AUTH_SECRET` set independently (so rotating it can force-logout).
- [ ] `SUPPORT_PUBLIC_TICKET_SECRET` set.
- [ ] At least one admin email in `SUPPORT_ADMIN_EMAILS`.
- [ ] All other role allowlists populated as needed.

## 2. Email tested

- [ ] `RESEND_API_KEY` set.
- [ ] `SUPPORT_EMAIL_FROM` and `SUPPORT_EMAIL_REPLY_TO` configured.
- [ ] Submit a test ticket → confirm `ticket_received` email arrives.
- [ ] From admin Email Actions, send each of the 8 templates against a test ticket → all arrive.
- [ ] Send a custom email → arrives with HTML escaped properly and footer warning visible.
- [ ] Disabled-mode test (temporarily unset `RESEND_API_KEY` in a non-prod env): confirm draft row written, no crash, alert surfaced.

## 3. Sentry tested

- [ ] `SENTRY_DSN_API` (backend) set.
- [ ] `VITE_SENTRY_DSN_WEB` set at build time.
- [ ] Hit `/api/_sentry-test` (with `ENABLE_SENTRY_TEST_ENDPOINT=true` if in prod) → event appears in Sentry within 1 min.
- [ ] Visit `/__boundary-test` (with `VITE_ENABLE_BOUNDARY_TEST=true` if in prod build) → frontend event appears in Sentry; `AppErrorBoundary` shows event id + Try again + Report a Problem.
- [ ] Verify Sentry events do not contain raw email/whatsapp/passwords/free-text fields.
- [ ] **Disable** `ENABLE_SENTRY_TEST_ENDPOINT` and `VITE_ENABLE_BOUNDARY_TEST` after verification.

## 4. Linear tested

- [ ] `LINEAR_API_KEY` set.
- [ ] At least `LINEAR_DEFAULT_TEAM_ID` set; per-product team IDs set as needed.
- [ ] On a test ticket: `GET /api/support/integrations/linear/status` → `configured:true`, `hasTeamForProductCode:true`.
- [ ] **Create Linear Issue** → succeeds; link saved; internal message logged.
- [ ] Click again → 409 "Linear issue already exists".
- [ ] Verify ticket detail shows the link with team/status/key/URL.

## 5. Public ticket tested

- [ ] Submit a ticket via `/help/report-problem` from an external browser.
- [ ] Receive ticket reference; confirmation email arrives.
- [ ] Track via `/help/track-ticket` with the email used → access granted.
- [ ] Track with the wrong email → no leak about whether ticket exists.
- [ ] Reply from public page → appears in admin Communication Log; if ticket was closed/resolved/fixed, it auto-reopens.
- [ ] Upload an attachment from public page → appears in admin Attachments card.

## 6. Wallboard tested

- [ ] `/admin/support/wallboard` requires login.
- [ ] Renders cleanly on the production display (1920×1080 or whatever monitor will be used).
- [ ] KPIs and watchlists match what's actually in the database.
- [ ] Auto-refresh every 60s confirmed by watching for a known new ticket to appear.

## 7. Roles tested

- [ ] Login as each of the 6 roles and confirm:
  - [ ] `support_admin` — full access.
  - [ ] `support_agent` — tickets/notes/messages/attachments yes; templates/settings hidden.
  - [ ] `product_owner` — escalate/Linear yes; settings hidden.
  - [ ] `developer` — engineering actions yes; settings hidden.
  - [ ] `qa_verifier` — verify/reopen yes; settings hidden.
  - [ ] `viewer` — read-only banner shown on ticket detail; PATCH returns 403 from server.
- [ ] Unauthenticated user → redirected to login.
- [ ] Authenticated but unauthorised → 403 from server, restricted UI.
- [ ] Admin-outcome workflow actions (`mark_spam`/`mark_duplicate`/`mark_not_a_bug`/`close_ticket`) only work for admin.

## 8. Attachment security tested

- [ ] PNG ≤10MB accepted.
- [ ] PDF ≤15MB accepted; PDF >15MB rejected.
- [ ] MP4 ≤50MB accepted; MP4 >50MB rejected.
- [ ] `.exe` rejected.
- [ ] `.txt` renamed to `.png` rejected (magic-byte sniff catches it).
- [ ] Cross-ticket attachment access blocked: get an attachment ID from ticket A, try to fetch via ticket B's URL → 404.
- [ ] Public attachment upload without a valid token → 401.
- [ ] Admin attachment delete requires `manage_attachments` (developer/qa/viewer can't delete).

## 9. Public privacy tested

- [ ] Run the curl spot-checks from `docs/support-testing-checklist.md` §6 — all "Clean".
- [ ] Visit `/help/ticket/:ref` and view-source → no internalStatus, no SLA, no Linear/Sentry refs, no providerMessageId.
- [ ] Open browser devtools → no internal field names appear in any network response.

## 10. SLA tested

- [ ] Create a high-priority ticket → SLA badge shows `on_track` with a 2h target.
- [ ] Wait into the approaching window → badge flips to `approaching`.
- [ ] Workflow Actions → `request_more_info` → SLA flips to `paused`.
- [ ] Resume → SLA flips back to `on_track`.
- [ ] Escalate to engineering → SLA phase flips to `engineering_fix` with the larger target.
- [ ] Close the ticket → SLA flips to `completed`.
- [ ] Wallboard shows the breached/approaching ticket in the matching watchlist.

## 11. Test endpoints disabled

- [ ] `ENABLE_SENTRY_TEST_ENDPOINT` is **not** set in production env.
- [ ] `VITE_ENABLE_BOUNDARY_TEST` is **not** set when building production bundle.
- [ ] Confirm `GET /api/_sentry-test` returns 404 in production.
- [ ] Confirm `/__boundary-test` returns NotFound in production.

## 12. Backup / storage plan confirmed

- [ ] Postgres backups configured (Replit-managed Postgres or external).
- [ ] `SUPPORT_ATTACHMENTS_DIR` points at a persistent volume; volume is included in backups.
- [ ] Restore procedure documented and tested at least once.

## 13. Team trained

- [ ] Support team has read `docs/support-runbook.md`.
- [ ] At least one admin can rotate `SUPPORT_AUTH_PASSWORD` and `SUPPORT_AUTH_SECRET` from memory.
- [ ] On-call rotation defined for triage queue + wallboard monitoring.
- [ ] Escalation path to engineering is clear.

## 14. WhatsApp + Integrations status

- [ ] `WHATSAPP_PROVIDER` is intentionally set (`none`/`manual` is OK; `meta_cloud_api`/`twilio` requires the matching env vars).
- [ ] If a real WhatsApp provider is selected, the matching `WHATSAPP_*` / `TWILIO_*` env vars are set (see `docs/support-env-vars.md`).
- [ ] Sign in as a `support_admin` and visit `/admin/support/integrations`:
  - [ ] Every card shows the expected configured / fallback / not-configured chip.
  - [ ] No secret values appear anywhere on the page or in the network response.
  - [ ] Click **Send test email** with the default recipient → arrives in inbox; success row shown with provider message id.
  - [ ] Send to a deliberately invalid address → 400 returned, UI shows error.
  - [ ] If `RESEND_API_KEY` is unset, the email card shows **Not configured** and the test action returns `disabled:true` instead of crashing.
- [ ] Audit log shows `integration.email_test` rows for each test send.

## 15. Final verification

- [ ] `pnpm run typecheck` — clean
- [ ] `pnpm run build` — clean
- [ ] Backend smoke checks (`docs/support-testing-checklist.md` §8) — all expected codes
- [ ] End-to-end manual run-through (`docs/support-testing-checklist.md` §1–7) — all green
