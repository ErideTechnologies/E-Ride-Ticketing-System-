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

- DB schema (source of truth): `lib/db/src/schema/` — `enums.ts`, `organisations.ts`, `products.ts`, `tickets.ts`, `notes.ts` (internal notes + status history), `attachments.ts` (`support_ticket_attachments`, cascade delete with ticket)
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
- No Linear/Sentry/WhatsApp/email sending/SaaS yet.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Orval generates `zod.date()` for `format: date-time` query params, but Express query values are strings. Date-range filters (`createdFrom`/`createdTo`) are parsed manually in `routes/support.ts` rather than via the generated schema.
- Orval names body Zod schemas after the **operation**, not the OpenAPI schema (e.g. `UpdateSupportTicketBody`, not `SupportTicketUpdate`). The matching TS interface uses the schema name and lives under `generated/types/`. Import the operation-named const for runtime validation.
- Postgres throws on invalid UUID casts. Always guard `:id` route params with a UUID regex before hitting the DB; otherwise an unknown path segment 500s instead of returning 404.
- Orval generates `zod.instanceof(File)` for multipart bodies. The api-zod tsconfig must include `"dom"` in `lib` so `File`/`Blob` types resolve. Reference multipart bodies via a named schema (`$ref`) instead of inlining — Orval names body schemas after the **operation** and inlining causes type collisions across endpoints.
- Attachment uploads must write the file *and* insert the DB row inside a try/catch that removes the file on any failure, otherwise a DB error leaves an orphan on disk. Magic-byte sniffing (`validateAttachmentContent`) runs *after* MIME/ext validation and *before* persisting.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
