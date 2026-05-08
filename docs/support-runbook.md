# Support Runbook

Operating process for the Eride Support Command Centre.

## Daily flow

1. **Triage queue** — open `/admin/support/tickets`, filter `internalStatus = triage_required` and sort newest-first.
2. For each ticket:
   - Confirm category and adjust priority/severity if the auto-suggestion was wrong.
   - Click **Mark in support review** (Workflow Actions) to claim it.
   - Add an internal note describing what was checked.
3. **Communicate with the reporter** — use a Communication Log quick template ("Under review") or send the matching email template.
4. **Resolve, escalate, or request more info:**
   - **Resolve** — fix the issue or confirm it's working; click **Mark resolved**.
   - **Request more info** — click **Request more info** (pauses SLA via `more_info_needed`); send the matching email or WhatsApp template.
   - **Escalate to engineering** — click **Escalate to engineering**; open the Engineering Escalation card.

## Escalation to engineering

1. In the Engineering Escalation card, confirm the readiness summary is green.
2. **Linear API mode** (when `LINEAR_API_KEY` is set):
   - Click **Create Linear Issue**. The route is serialized per ticket — duplicate clicks are safe.
   - Outcome appears inline; link is upserted into `support_ticket_linear_links`; an internal-only message records the new key + URL.
3. **Manual mode** (when Linear is not configured):
   - Click **Generate Linear Issue text** → **Copy** → paste into Linear UI.
   - Paste the new issue key/URL into the Linear link form and **Save**.
4. Click **Mark in engineering** in Workflow Actions to advance status.
5. Optional: paste relevant Sentry issue/event/URL into the Sentry Links card.

## QA verification

- When engineering marks the ticket **Fixed (waiting user notification)**, QA opens the ticket and either:
  - Verifies the fix → click **Mark verified, ready to notify user** → send fix-notification email/WhatsApp.
  - Rejects the fix → click **Mark needs further engineering** with a reason; this writes a status-history row and reopens engineering SLA.

## Reopening

- A user reply on `/help/ticket/:ref` automatically reopens tickets where publicStatus ∈ {fixed, resolved, closed} → publicStatus=under_review, internalStatus=support_review.
- Manually reopen via Workflow Actions → **Reopen ticket** (clears `closedAt`).

## Wallboard

- Show `/admin/support/wallboard` on a TV/monitor for live triage visibility.
- Refreshes every 60s via React Query; clock ticks each second client-side.
- Watchlists: SLA breached, SLA approaching breach, urgent/high open, awaiting triage, fixed-waiting-user-notification.

## Common admin tasks

| Task | Where | Permission |
| --- | --- | --- |
| Edit message templates | `/admin/support/templates` | `support_admin` |
| Update support email defaults / public-ticket toggles | `/admin/support/settings` | `support_admin` |
| Invite a new internal user | Set their email in the appropriate `SUPPORT_*_EMAILS` env var, share the shared `SUPPORT_AUTH_PASSWORD` | `support_admin` |
| Rotate the auth password | Update `SUPPORT_AUTH_PASSWORD`; existing sessions remain valid until they expire (12h) | `support_admin` |
| Force-logout everyone | Rotate `SUPPORT_AUTH_SECRET` (or `SESSION_SECRET` if not set); all cookies become invalid immediately | `support_admin` |
| Spam / duplicate / not-a-bug close | Workflow Actions admin outcomes | `manage_workflow_admin_outcomes` (admin only) |

## Incident response

- **Email broken** — check that `RESEND_API_KEY` is set; if unset, all sends are no-ops with `disabled:true` and a `drafted` row is still written. The Email Actions card surfaces "Email is not configured…" when disabled.
- **Linear broken** — Linear status badge in Engineering Escalation card shows configured/not-configured/no-team-for-product. Manual fallback (Copy text + Linear link form) always works.
- **Sentry quiet** — verify `SENTRY_DSN_API` and `VITE_SENTRY_DSN_WEB` are set. To smoke-test: hit `/api/_sentry-test` (gated on `NODE_ENV !== "production"` or `ENABLE_SENTRY_TEST_ENDPOINT=true`).
- **Public ticket tracking returning 401** — token TTL is 30 min by default (configurable via Settings → token TTL minutes). Reporter must re-verify with email/WhatsApp.
