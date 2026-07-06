---
name: Support permission guard invariants
description: Authorization rules for the /support API — role tiers, internal-read gating, and the trailing-slash normalization requirement.
---

# Support permission guard invariants

The `/support` API uses two middlewares in `artifacts/api-server/src/lib/supportAuth.ts`:
`supportAuthGuard` (authentication + public whitelist) and `supportPermissionGuard`
(declarative `PERMISSION_RULES`, first-match-wins, anchored `^...$` regexes).

## Reporter role must be blocked server-side, not just in the UI
The `reporter` role has ZERO permissions (can only use the public report/track flow).
Frontend route gating (`RequireSupportAuth permission="view_dashboard"`) is NOT enough —
any authenticated session can hit the API directly. **Every internal ticket/dashboard
GET read must have an explicit `view_dashboard` PERMISSION_RULE** (ticket list, ticket
detail, and all sub-resources: notes, messages, status-history, linear-link,
sentry-links, attachments + attachment download, wallboard, sla-summary,
integrations/linear/status). Without a rule, an endpoint only requires auth and leaks
internal data to reporters.

**Why:** a reporter session returned 200 on `GET /support/tickets` before rules were
added — the guard only enforced writes/admin-reads, so ticket data leaked to the
lowest-privilege role.

## Normalize trailing slashes before matching (authz bypass)
Express matches trailing-slash variants (`/support/tickets/`) by default, but the
matchers use anchored regexes (`^/support/tickets$`). A reporter could bypass every
rule by appending `/`. Both guards call `normalizeSupportPath()` (strips trailing
slashes, keeps root) BEFORE public-path and permission matching.

**Why:** reproduced live — `GET /support/tickets/` returned 200 for a reporter while
`GET /support/tickets` returned 403. Any new guard/matcher must match the normalized
path, never `req.path` directly.

**How to apply:** when adding a new protected `/support` route, add its GET rule to
`PERMISSION_RULES` and verify both canonical and trailing-slash URLs return 403 for a
reporter session and 200 for admin.
