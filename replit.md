# Eride Support Command Centre

Multi-tenant support and bug ticketing platform. MVP serves Eride Technologies; the data model is built so additional organisations can be onboarded later without restructuring.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/db run seed` — seed Eride org + active products + default templates/settings (idempotent)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + wouter + TanStack Query + shadcn/ui + Tailwind

## Documentation

The full product spec, runbook, env vars, security notes, and QA checklists live under `docs/`:

- **`docs/support-command-centre.md`** — feature overview (architecture, public/internal surfaces, roles, where things live)
- **`docs/support-runbook.md`** — operating process for the support team
- **`docs/support-env-vars.md`** — every environment variable + production checklist
- **`docs/support-security-checklist.md`** — privacy invariants, auth model, attachment/email/Linear/Sentry safety
- **`docs/support-testing-checklist.md`** — manual QA checklist
- **`docs/support-launch-checklist.md`** — go-live checklist

If you change behaviour that affects any of the above, update the matching doc in the same change.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- **Orval `zod.date()` for query params** — Orval generates `zod.date()` for `format: date-time` query params, but Express query values are strings. Date-range filters (`createdFrom`/`createdTo`) are parsed manually in `routes/support.ts`.
- **Orval body schema naming** — body Zod schemas are named after the **operation**, not the OpenAPI schema (e.g. `UpdateSupportTicketBody`, not `SupportTicketUpdate`). Import the operation-named const for runtime validation.
- **UUID route params** — Postgres throws on invalid UUID casts. Always guard `:id` route params with a UUID regex before hitting the DB; otherwise an unknown path segment 500s instead of returning 404.
- **Multipart bodies need `dom` lib** — Orval generates `zod.instanceof(File)` for multipart bodies. The api-zod tsconfig must include `"dom"` in `lib`. Reference multipart bodies via a named schema (`$ref`) instead of inlining — inlining causes type collisions.
- **Attachment upload rollback** — write the file *and* insert the DB row inside a try/catch that removes the file on any failure, otherwise a DB error leaves an orphan on disk. Magic-byte sniffing runs *after* MIME/ext validation and *before* persisting.
- **Linear issue creation must be serialized per-ticket** — wrap the duplicate-link check + Linear call + upsert in a `db.transaction` and acquire `pg_advisory_xact_lock(hashtext(ticketId))` first. Otherwise concurrent calls create two issues and orphan one link.
- **SLA must remain internal-only** — never add SLA fields to `serializePublicTicket`, `serializePublicMessage`, or any `/support/public/*` response. The public ticket-tracking page must never render SLA badges/timers.
- **Drizzle `sql\`= ANY(${jsArray}::uuid[])\`` is broken** — interpolating a JS array fails with "cannot cast type record to uuid[]". Always use `inArray(column, jsArray)` for bulk filters.
- **Auth path matching is router-relative** — both `supportAuthGuard` (whitelist) and `supportPermissionGuard` (declarative rules) match against paths *without* the `/api` mount prefix. A rule like `"/api/support/..."` will silently never match. Public route whitelist must include `POST /support/tickets` and `GET /support/products` so the public report-a-problem form keeps working unauthenticated.
- **Email send/log must be two-phase** — insert the `support_ticket_messages` row with `delivery_status='drafted'` *before* calling the provider, then update the row with the outcome. Sending first risks delivered emails with no audit trail and duplicate sends on retries. Custom-mode HTML must be rendered server-side from `bodyText`; never accept caller-supplied HTML.
- **Public endpoints intentionally NOT in OpenAPI** — the public `/support/public/*` routes are called via plain `fetch` to avoid Orval's path+query `XxxParams` collision; they must never be added to `openapi.yaml`.
- **Test endpoints must stay gated in production** — `/api/_sentry-test` (env: `ENABLE_SENTRY_TEST_ENDPOINT`) and `/__boundary-test` (build env: `VITE_ENABLE_BOUNDARY_TEST`) are off by default in production. Re-enable only for one-off Sentry verification, then disable again.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
