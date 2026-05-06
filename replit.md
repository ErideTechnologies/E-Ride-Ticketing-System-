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

- DB schema (source of truth): `lib/db/src/schema/` — `enums.ts`, `organisations.ts`, `products.ts`, `tickets.ts`
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
- Server suggests `priority`/`severity` from category (see `artifacts/api-server/src/routes/support.ts`); ticket created with `source=public_form`, `publicStatus=received`, `internalStatus=triage_required`.
- No Linear/Sentry/WhatsApp/admin/SaaS yet.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
