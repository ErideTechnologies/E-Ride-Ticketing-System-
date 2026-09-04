# Eride Dogma Support Centre

## Full Product and Technical Specification

**Product tagline:** Structured support. Controlled resolution.  
**Public-facing name:** Eride Support  
**Internal product name:** Eride Dogma Support Centre  
**Wallboard name:** Dogma Command Centre

---

## 1. Executive summary

The Eride Dogma Support Centre is a multi-product support-ticket and defect-management platform. It gives authorised users a structured way to submit, review, assign, escalate, resolve, close, and audit support requests.

The current implementation serves Eride Technologies. Its data model is multi-tenant so additional organisations and products can be introduced later without redesigning the core database.

The platform consists of:

1. A React web application for ticket reporting, tracking, administration, and wallboard displays.
2. An Express API that implements authentication, authorization, ticket workflows, communication, attachments, integrations, and reporting.
3. A PostgreSQL database accessed through Drizzle ORM.
4. A generated API client and runtime validators derived from an OpenAPI contract.

---

## 2. Primary objectives

- Provide one controlled intake point for product-support requests.
- Give every ticket a unique, human-readable reference.
- Separate public ticket information from internal operational information.
- Help support staff prioritize work by status, priority, severity, and SLA.
- Keep a history of status changes, communications, notes, and major actions.
- Escalate technical defects to engineering through Linear or manual handoff.
- Notify reporters through email and supported WhatsApp modes.
- Protect private reporter and internal engineering information.
- Support more organisations and products in future.

---

## 3. Main user groups

### 3.1 Ticket reporter

A reporter submits a support request and can track it using the ticket reference plus the matching email address or WhatsApp number.

Reporter-visible information is intentionally limited. Reporters cannot see:

- Internal status
- Internal notes
- SLA timers
- Linear or Sentry references
- Engineering handoff text
- Provider message identifiers or delivery errors
- Other internal operational metadata

### 3.2 Support administrator

A support administrator has complete access to the internal system, including:

- Dashboard and wallboard
- Ticket list and ticket details
- Ticket editing and workflow actions
- Notes, messages, and attachments
- Settings and integrations
- Engineering escalation
- Administrative outcomes such as duplicate, spam, or not a bug

### 3.3 Support agent

A support agent can review and update tickets, manage normal workflow actions, communicate with reporters, and manage attachments.

### 3.4 Product owner

A product owner can review tickets and participate in engineering escalation, Linear linking, and Sentry linking.

### 3.5 Developer

A developer can review and update assigned technical tickets, use engineering workflow actions, and manage Linear and Sentry references.

### 3.6 QA verifier

A QA verifier can view, update, and progress tickets through testing and verification stages.

### 3.7 Viewer

A viewer has read-only dashboard and ticket visibility.

---

## 4. Authentication and authorization

### 4.1 Current login model

Internal authentication uses:

- An email address listed in a role-specific allow-list.
- A shared internal password.
- A signed HTTP-only session cookie after successful login.

The main configuration variables are:

- `SUPPORT_ADMIN_EMAILS`
- `SUPPORT_AGENT_EMAILS`
- `SUPPORT_PRODUCT_OWNER_EMAILS`
- `SUPPORT_DEVELOPER_EMAILS`
- `SUPPORT_QA_EMAILS`
- `SUPPORT_VIEWER_EMAILS`
- `SUPPORT_REPORTER_EMAILS`
- `SUPPORT_AUTH_PASSWORD`
- `SUPPORT_REPORTER_PASSWORD`
- `SUPPORT_AUTH_SECRET`
- `SESSION_SECRET`

Email matching is case-insensitive. If an email appears in more than one role list, the highest-privilege matching role is used.

The shared-password design means changing `SUPPORT_AUTH_PASSWORD` changes the password for all internal roles that use it. It is not a database-backed, per-user password system.

### 4.2 Sessions

- Session cookie name: `support_auth`
- Cookie is HTTP-only.
- Cookie uses `SameSite=Lax`.
- Cookie is secure in production.
- Default session life is 12 hours.
- Cookie content is signed with an HMAC secret.

### 4.3 Permission model

The application defines permissions for:

- Viewing the dashboard
- Editing tickets
- Sending email
- Managing attachments
- Managing standard workflow actions
- Managing administrative workflow outcomes
- Creating Linear issues
- Managing Linear links
- Managing Sentry links
- Managing settings
- Managing templates at API level

The backend is the final enforcement point. Frontend route guards and hidden controls improve usability, but do not replace server authorization.

---

## 5. Frontend specification

### 5.1 Technology

- React
- TypeScript
- Vite
- Wouter for routing
- TanStack Query for server state and mutations
- Tailwind CSS
- shadcn/ui and Radix UI components
- React Hook Form and Zod where applicable
- Lucide icons
- Recharts for charts and visual summaries
- Sentry React SDK when configured

### 5.2 Application shell

The frontend uses:

- A global TanStack Query client
- A support-authentication provider
- Global tooltip and toast providers
- Wouter routes
- An application error boundary

### 5.3 Public and reporter routes

| Route | Purpose |
|---|---|
| `/` | Redirects to `/help` |
| `/help` | Main support landing page |
| `/help/report-problem` | Support-ticket submission form |
| `/help/report-problem/confirmation` | Displays the created ticket reference and next steps |
| `/help/track-ticket` | Verifies a reporter using reference plus email or WhatsApp |
| `/help/ticket/:ticketReference` | Displays the public-safe ticket view |

The current web interface places `/help*` pages behind a frontend login gate. The ticket-creation and product-list API endpoints remain open intentionally so approved external applications can submit tickets.

### 5.4 Internal routes

| Route | Purpose |
|---|---|
| `/admin/support` | Redirects to the dashboard |
| `/admin/support/login` | Internal sign-in |
| `/admin/support/dashboard` | Operational summary |
| `/admin/support/tickets` | Full ticket list |
| `/admin/support/tickets/:id` | Detailed ticket workbench |
| `/admin/support/wallboard` | TV-friendly live command centre |
| `/admin/support/settings` | Support settings; administrator only |
| `/admin/support/integrations` | Integration status and testing; administrator only |

The former dedicated Message Templates page and navigation item have been removed. Template-related backend capabilities and inline ticket communication helpers still exist.

### 5.5 Dashboard

The dashboard combines:

- Total open tickets
- Tickets awaiting triage
- Urgent tickets
- SLA breaches
- Product-level ticket totals
- SLA performance
- Recent ticket activity
- Links into ticket details

### 5.6 Ticket list

The ticket list fetches current tickets from the API and displays:

- Ticket reference
- Product
- Full summary
- Internal status
- Priority
- Created date and time
- A dedicated View button

Responsive mobile cards include the same key data and a View full ticket button.

Summary cards show:

- Total tickets
- Awaiting triage
- Urgent
- High priority
- SLA overdue
- SLA due soon

### 5.7 Ticket detail workbench

The ticket-detail screen is the primary operations surface. It includes:

- Ticket identity and status badges
- Workflow actions
- SLA information
- Ticket overview
- Reporter details
- Editable issue details
- Status, priority, severity, and category management
- Assignment information
- Attachments
- Internal notes
- Status history
- Email and communication actions
- Communication history
- Linear engineering escalation
- Sentry links
- Developer handoff content

Resolution actions include:

- Mark resolved
- Close ticket
- Reopen ticket

These actions update both the relevant status fields and the status history.

### 5.8 Wallboard

The Dogma Command Centre is optimized for a large display. It shows live operational totals, product breakdowns, urgent work, SLA conditions, and ticket activity. It refreshes periodically and links ticket rows to their detail screens.

### 5.9 Frontend data flow

- Generated hooks are imported from `@workspace/api-client-react`.
- Query hooks load API data.
- Mutation hooks create or update data.
- Successful mutations invalidate the relevant list, detail, history, or integration query.
- Authentication uses cookies.
- Public ticket access tokens are stored in `sessionStorage`, scoped by ticket reference.
- Local component state uses React hooks such as `useState` and `useMemo`.

### 5.10 Visual system

The visual identity uses:

- Matte black
- Graphite and gunmetal
- Steel blue-grey
- Desaturated steel slate
- Silver highlights
- Ice-blue accents
- Red for critical conditions
- Amber for warnings
- Green for successful outcomes

The public support experience uses a dark, high-contrast visual treatment. Internal administration uses a restrained light slate-and-white layout. The wallboard uses the premium dark Dogma theme.

---

## 6. Backend specification

### 6.1 Technology

- Node.js
- TypeScript
- Express 5
- PostgreSQL
- Drizzle ORM
- Zod runtime validation
- OpenAPI
- Orval code generation
- Pino structured logging
- Sentry Node SDK when configured
- Multer-style multipart handling for attachments

### 6.2 Server architecture

The API server:

1. Initializes optional error monitoring.
2. Builds the Express application.
3. Adds structured request logging.
4. Enables CORS for cross-application ticket submission.
5. Parses JSON and URL-encoded requests.
6. Mounts all routes under `/api`.
7. Applies support authentication and permission guards.
8. Uses a minimal error response that does not expose stack traces.
9. Binds to the runtime-provided `PORT`.

### 6.3 Core API groups

#### Health and authentication

- `GET /api/healthz`
- `GET /api/support/auth/me`
- `POST /api/support/auth/login`
- `POST /api/support/auth/logout`

#### Public ticket intake and tracking

- `GET /api/support/products`
- `POST /api/support/tickets`
- `POST /api/support/public/verify-ticket`
- `GET /api/support/public/tickets/:ticketReference`
- `GET /api/support/public/tickets/:ticketReference/messages`
- `POST /api/support/public/tickets/:ticketReference/reply`
- `POST /api/support/public/tickets/:ticketReference/attachments`

#### Internal ticket operations

- `GET /api/support/tickets`
- `GET /api/support/tickets/:id`
- `PATCH /api/support/tickets/:id`
- `POST /api/support/tickets/:id/workflow-action`

#### Notes and history

- `GET /api/support/tickets/:id/notes`
- `POST /api/support/tickets/:id/notes`
- `GET /api/support/tickets/:id/status-history`

#### Messages and email

- `GET /api/support/tickets/:id/messages`
- `POST /api/support/tickets/:id/messages`
- `POST /api/support/tickets/:id/send-email`

#### Attachments

- `GET /api/support/tickets/:id/attachments`
- `POST /api/support/tickets/:id/attachments`
- `GET /api/support/tickets/:id/attachments/:attachmentId`
- `DELETE /api/support/tickets/:id/attachments/:attachmentId`

#### Operational reporting

- `GET /api/support/wallboard`
- `GET /api/support/sla-summary`

#### Linear

- `GET /api/support/integrations/linear/status`
- `POST /api/support/tickets/:id/create-linear-issue`
- `GET /api/support/tickets/:id/linear-link`
- `POST /api/support/tickets/:id/linear-link`
- `DELETE /api/support/tickets/:id/linear-link`

#### Sentry references

- `GET /api/support/tickets/:id/sentry-links`
- `POST /api/support/tickets/:id/sentry-links`
- `DELETE /api/support/tickets/:id/sentry-links/:sentryLinkId`

#### Administration and configuration

- `GET /api/support/settings`
- `PATCH /api/support/settings`
- `GET /api/support/integrations/status`
- `POST /api/support/integrations/email/test`
- Template-management endpoints remain available at API level.
- A ticket-purge endpoint exists but requires both administrator permission and explicit environment enablement.

---

## 7. Ticket model and lifecycle

### 7.1 Ticket reference

Ticket references use:

`PRODUCTCODE-SUP-YYYY-NNNNNN`

Example:

`EMA-SUP-2026-000123`

The sequence is atomic and scoped by organisation, product, and calendar year.

### 7.2 Public status lifecycle

Public statuses are intentionally simple:

1. Received
2. Under review
3. More information needed
4. Being fixed
5. Fixed
6. Resolved
7. Closed

### 7.3 Internal status lifecycle

Internal statuses provide more operational detail:

- New
- Triage required
- Support review
- Needs user information
- Engineering escalation required
- Linear created
- In engineering
- In review
- In QA verification
- Fixed, waiting for user notification
- User notified
- Resolved
- Closed
- Duplicate
- Not a bug
- Deferred
- Spam

### 7.4 Triage

Triage required means the request has been received but still needs its initial assessment. Staff should confirm the product, category, priority, severity, completeness, assignment, and whether engineering escalation is required.

### 7.5 Workflow actions

The API provides named workflow actions grouped into:

- Support review
- Engineering
- Resolution
- Administrative outcomes

Each action can:

- Update public status
- Update internal status
- Add a history record
- Stamp resolved or closed timestamps
- Trigger an audit entry
- Trigger safe external lifecycle notifications when enabled

---

## 8. SLA specification

SLA means Service Level Agreement. In this system it represents an internal response or resolution target, not a customer-visible timer.

### 8.1 Support-review targets

- Urgent: 30 minutes
- High: 2 hours
- Medium: 8 hours
- Low: 48 hours

### 8.2 Engineering-fix targets

- Urgent: 4 hours
- High: 24 hours
- Medium: 168 hours
- Low: 336 hours

### 8.3 SLA states

- Not started
- On track
- Approaching
- Breached
- Paused
- Completed

SLA values are calculated dynamically when ticket information is read. SLA information is never included in public ticket responses.

---

## 9. Database specification

### 9.1 Database technology

- PostgreSQL
- Drizzle ORM
- UUID primary keys
- PostgreSQL enum types
- Foreign-key constraints
- Cascade deletion for ticket-owned child records where appropriate

### 9.2 Main tables

#### `support_organisations`

Stores tenant organisations, branding, contact information, plan information, and activation state.

#### `support_products`

Stores products belonging to an organisation, including:

- Product code and name
- Public/active state
- Ownership information
- Linear team mapping
- Sentry project mapping
- Display order

#### `support_tickets`

Stores the main ticket record, including:

- Organisation and product
- Ticket reference
- Source
- Public and internal status
- Category
- Priority
- Severity
- Reporter identity and optional contact details
- External user/company/firm/partner references
- Issue summary and narrative
- Page or workflow step
- Application and account references
- Environment
- Assignments
- Device information as JSON
- Consent information
- Created, updated, resolved, and closed timestamps

#### `support_ticket_sequences`

Provides atomic ticket-number allocation by organisation, product, and year.

#### `support_ticket_messages`

Stores inbound, outbound, and internal communication with:

- Direction
- Channel
- Message type
- Sender and recipient
- Body
- Delivery status
- Provider message identifier
- Delivery error
- Timestamp

#### `support_ticket_internal_notes`

Stores staff-only notes linked to a ticket.

#### `support_ticket_status_history`

Stores old and new public/internal statuses, actor information, reason, and timestamp.

#### `support_ticket_attachments`

Stores attachment metadata and storage path:

- Original and stored filename
- MIME type
- File size
- Storage location
- Uploader identity

#### `support_ticket_linear_links`

Stores the one active Linear issue link associated with a ticket.

#### `support_ticket_sentry_links`

Stores one or more Sentry issue references associated with a ticket.

#### `support_ticket_audit_log`

Stores major actions with actor identity, role, metadata, ticket reference, and timestamp.

#### `support_settings`

Stores organisation-level support configuration such as:

- Sender and reply-to defaults
- Public-token duration
- Public reply enablement
- Public attachment enablement

#### `support_message_templates`

Stores organisation-level message templates. The dedicated frontend management page has been removed, but the underlying table and API functionality remain for existing communication flows.

### 9.3 Relationships

- An organisation has many products.
- An organisation has many tickets.
- A product belongs to one organisation.
- A ticket belongs to one organisation and one product.
- A ticket has many messages.
- A ticket has many notes.
- A ticket has many status-history records.
- A ticket has many attachments.
- A ticket can have one Linear link.
- A ticket can have many Sentry links.
- A ticket can have many audit records.

---

## 10. Attachments

Supported attachment limits:

- PNG, JPG, and WEBP: up to 10 MB
- PDF: up to 15 MB
- MP4 and MOV: up to 50 MB

Validation includes:

- File extension
- Declared MIME type
- File size
- File magic bytes

Ticket creation and attachment upload are two phases. If ticket creation succeeds but attachment upload fails, the ticket remains valid and the user receives a non-blocking upload warning.

The current implementation stores files on the local filesystem under a configurable attachment directory. Production should use persistent storage.

---

## 11. Communications

### 11.1 Email

Email uses Resend when `RESEND_API_KEY` is configured.

The sending process is intentionally two-phase:

1. Insert a drafted message row.
2. Call the email provider.
3. Update the row with the delivery result.

This prevents successful deliveries from disappearing from the audit trail.

### 11.2 WhatsApp

Supported modes include:

- None
- Manual
- Twilio
- Prepared Meta Cloud API configuration

Twilio delivery is wired. Manual mode records the communication while a staff member sends it from an external device.

### 11.3 Communication privacy

Internal messages and delivery errors are excluded from reporter-facing responses. Public message endpoints expose only approved, delivered, public-safe communication.

---

## 12. External integrations

### 12.1 Resend

Purpose: send customer-facing email notifications.

### 12.2 Linear

Purpose: create or link engineering issues when support work becomes a software defect.

The creation flow uses a per-ticket transaction lock to prevent duplicate Linear issues from concurrent requests.

### 12.3 Sentry

Purpose:

- Capture frontend and backend application errors when DSNs are configured.
- Associate Sentry issue links with support tickets.

Sensitive fields are redacted before monitoring events are sent.

### 12.4 Hermes webhook

Purpose: send safe ticket-lifecycle metadata to an external Hermes process.

The payload intentionally excludes:

- Reporter email or phone
- Message bodies
- Attachments
- Internal notes

Delivery is signed, time-limited, fire-and-forget, and must never block ticket updates.

---

## 13. Security and privacy

Key controls include:

- Signed HTTP-only authentication cookies
- Server-side role and permission enforcement
- Public-ticket verification tokens
- Expiring public access tokens
- Generic server errors without stack traces
- Structured audit logging
- UUID identifiers
- Attachment type and content validation
- Template HTML safety validation at API level
- Sentry PII redaction
- Internal/public response separation
- Production-gated diagnostic and destructive endpoints

Sensitive information includes:

- Reporter contact details
- Application and account references
- Device information
- Message bodies
- Consent IP address
- Attachment contents
- Authentication and provider secrets
- External issue identifiers

Secret values must remain in Replit Secrets and must never be committed to source control or displayed by the application.

---

## 14. API contract and generated code

The OpenAPI source is:

`lib/api-spec/openapi.yaml`

Orval generates:

- React Query hooks and TypeScript client types in `lib/api-client-react`
- Zod runtime schemas in `lib/api-zod`

The generation command is:

```bash
pnpm --filter @workspace/api-spec run codegen
```

The OpenAPI contract is the source of truth for generated internal endpoints. Some public ticket-tracking endpoints are intentionally called through plain `fetch` and excluded from OpenAPI to avoid generated naming collisions and to keep their public-safe response handling explicit.

---

## 15. Source-code structure

```text
artifacts/
  api-server/
    src/
      app.ts
      index.ts
      lib/
      routes/
  web/
    src/
      components/
      lib/
      pages/
      App.tsx
      index.css
  mockup-sandbox/

lib/
  api-spec/
  api-client-react/
  api-zod/
  db/
    src/
      schema/

docs/
scripts/
```

### Important paths

- Frontend router: `artifacts/web/src/App.tsx`
- Frontend pages: `artifacts/web/src/pages/`
- Frontend shared components: `artifacts/web/src/components/`
- Frontend theme: `artifacts/web/src/index.css`
- API entry point: `artifacts/api-server/src/index.ts`
- Express setup: `artifacts/api-server/src/app.ts`
- API routes: `artifacts/api-server/src/routes/`
- API helpers and integrations: `artifacts/api-server/src/lib/`
- OpenAPI contract: `lib/api-spec/openapi.yaml`
- Database schema: `lib/db/src/schema/`
- Database seed: `lib/db/src/seed.ts`
- Generated React API client: `lib/api-client-react/src/generated/`
- Generated Zod validators: `lib/api-zod/src/generated/`

---

## 16. Build, validation, and operation

### Main commands

```bash
# Full type checking
pnpm run typecheck

# Type checking plus package builds
pnpm run build

# Regenerate API clients and validators
pnpm --filter @workspace/api-spec run codegen

# Development database schema push
pnpm --filter @workspace/db run push

# Seed required organisation, products, settings, and defaults
pnpm --filter @workspace/db run seed
```

Runtime services are managed as separate web and API workflows. The frontend is published as a static Vite build, while the API is published as a Node service.

---

## 17. Environment configuration

Important categories include:

- Database connection
- Session signing
- Role email allow-lists
- Shared login passwords
- Public ticket token signing
- Resend email
- WhatsApp provider
- Linear API and team mapping
- Sentry DSNs
- Attachment storage
- Hermes webhook
- Diagnostic feature flags

The complete variable list and production checklist are maintained in:

`docs/support-env-vars.md`

No secret values are included in this specification.

---

## 18. Current implementation limitations

- Authentication uses shared passwords rather than individual accounts.
- User accounts are not stored in a dedicated users table.
- The frontend Message Templates management page has been removed, although backend template support remains.
- Local attachment storage requires a persistent production volume or future object-storage migration.
- Meta WhatsApp Cloud API mode is prepared but not fully implemented.
- GitHub pull-request automation is not implemented.
- Automated SaaS onboarding and billing for additional organisations are not implemented.

---

## 19. Recommended future improvements

1. Replace shared-password login with individual managed identities and per-user sessions.
2. Add an administrator-controlled user-management screen.
3. Move attachments to durable object storage.
4. Add automated test coverage for authentication, ticket submission, public verification, and workflow transitions.
5. Add pagination and server-side sorting for large ticket volumes.
6. Add configurable SLA policies per organisation and product.
7. Add production monitoring dashboards and alerting.
8. Remove unused template-management contracts and database structures if template functionality is permanently retired.

---

## 20. Acceptance criteria

The platform is considered operational when:

- An authorised reporter can submit a ticket.
- A unique ticket reference is generated.
- An authorised staff member can sign in.
- Tickets appear on the dashboard and ticket list.
- The full ticket can be opened through the View action.
- Staff can update, assign, resolve, close, and reopen tickets according to role.
- Status changes are recorded in history.
- Public tracking reveals only public-safe information.
- Internal notes and SLA information never appear publicly.
- Email and other integrations fail safely when unconfigured.
- Attachments are validated before persistence.
- Production secrets are configured securely.
- The frontend and API build and start without errors.
