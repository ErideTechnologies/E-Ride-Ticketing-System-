# Eride Dogma Support Centre
## AWS EC2, Amazon RDS, Amazon S3, and Vercel Migration Specification

**Status:** Planning baseline  
**Production domain:** `https://dogmacommand.center`  
**Current hosting:** Replit  
**Target hosting:** Vercel frontend, AWS-hosted API, Amazon RDS for PostgreSQL, private Amazon S3 attachment storage  

---

## 1. Purpose

This specification defines the current application, the proposed target architecture, the changes required to migrate it, the migration sequence, security requirements, validation criteria, rollback strategy, and operational ownership.

The migration must preserve the existing public API contract:

```text
https://dogmacommand.center/api/*
```

Existing browser and external clients should not need to change their endpoint URLs.

## 2. Migration objectives

1. Host the React frontend on Vercel.
2. Host the Express API on AWS behind HTTPS.
3. Move PostgreSQL data to Amazon RDS for PostgreSQL.
4. Move uploaded documents to a private Amazon S3 bucket.
5. Keep `dogmacommand.center` as the public application domain.
6. Keep existing `/api/*` paths and request/response contracts.
7. Preserve ticket IDs, references, users, messages, audit history, settings, templates, and integration links.
8. Prevent ticket or attachment loss during cutover.
9. Add production-grade security, backups, monitoring, deployment automation, and rollback controls.

## 3. Out of scope for the first migration

Unless separately approved, the first migration does not:

- redesign the application;
- replace React, Vite, Express, Drizzle, or PostgreSQL;
- change existing API response formats;
- expose S3 objects publicly;
- change ticket reference formats;
- introduce a mobile application;
- rewrite the application as AWS Lambda functions;
- change email, WhatsApp, Linear, Sentry, or Hermes providers.

## 4. Current system

### 4.1 Repository structure

The project is a pnpm TypeScript monorepo:

```text
artifacts/web                  React and Vite frontend
artifacts/api-server           Express API server
lib/api-spec                   OpenAPI source contract
lib/api-client-react           Generated React Query API client
lib/api-zod                    Generated server-side validation
lib/db                         PostgreSQL schema, client, and seed logic
scripts                        Workspace scripts
```

### 4.2 Current technology

| Area | Current technology |
|---|---|
| Frontend | React 19, Vite 7, TypeScript, Tailwind CSS, Radix UI |
| Routing | Wouter |
| Client data | TanStack React Query |
| API | Node.js 24, Express 5, TypeScript |
| API validation | Zod generated from OpenAPI |
| Database | PostgreSQL, Drizzle ORM, `pg` pool |
| File upload | Multer memory upload plus local filesystem |
| Authentication | HMAC-signed HTTP-only support session cookie |
| Email | Resend |
| WhatsApp | Twilio/provider abstraction |
| Engineering integration | Linear GraphQL API |
| Error monitoring | Sentry |
| Logging | Pino and pino-http |
| Build/package manager | pnpm workspace and esbuild |

### 4.3 Current frontend routes

Public-facing routes:

```text
/
/help
/help/report-problem
/help/report-problem/confirmation
/help/track-ticket
/help/ticket/:ticketReference
```

Administrator routes:

```text
/admin/support
/admin/support/login
/admin/support/register
/admin/support/wallboard
/admin/support/dashboard
/admin/support/settings
/admin/support/integrations
/admin/support/tickets
/admin/support/tickets/:id
```

Development-only route:

```text
/__boundary-test
```

Vercel must return the frontend `index.html` for direct navigation to every frontend route while excluding `/api/*` from the SPA fallback.

### 4.4 Current API

The Express router is mounted at `/api`.

#### Health and authentication

```text
GET  /api/healthz
GET  /api/support/auth/me
POST /api/support/auth/login
POST /api/support/auth/register
POST /api/support/auth/logout
```

#### Public support

```text
GET  /api/support/products
POST /api/support/tickets
POST /api/support/public/verify-ticket
GET  /api/support/public/tickets/:ticketReference
GET  /api/support/public/tickets/:ticketReference/messages
POST /api/support/public/tickets/:ticketReference/reply
POST /api/support/public/tickets/:ticketReference/attachments
```

#### Dashboard and ticket management

```text
GET   /api/support/wallboard
GET   /api/support/sla-summary
GET   /api/support/tickets
GET   /api/support/tickets/:id
PATCH /api/support/tickets/:id
POST  /api/support/tickets/:id/workflow-action
```

#### Notes, messages, and history

```text
GET  /api/support/tickets/:id/notes
POST /api/support/tickets/:id/notes
GET  /api/support/tickets/:id/status-history
GET  /api/support/tickets/:id/messages
POST /api/support/tickets/:id/messages
POST /api/support/tickets/:id/send-email
```

#### Attachments

```text
GET    /api/support/tickets/:id/attachments
POST   /api/support/tickets/:id/attachments
GET    /api/support/tickets/:id/attachments/:attachmentId
DELETE /api/support/tickets/:id/attachments/:attachmentId
```

#### Linear and Sentry

```text
GET    /api/support/integrations/linear/status
GET    /api/support/tickets/:id/linear-link
POST   /api/support/tickets/:id/linear-link
DELETE /api/support/tickets/:id/linear-link
POST   /api/support/tickets/:id/create-linear-issue
GET    /api/support/tickets/:id/sentry-links
POST   /api/support/tickets/:id/sentry-links
DELETE /api/support/tickets/:id/sentry-links/:sentryLinkId
```

#### Configuration

```text
GET   /api/support/integrations/status
POST  /api/support/integrations/email/test
GET   /api/support/settings
PATCH /api/support/settings
GET   /api/support/templates
GET   /api/support/templates/:id
PATCH /api/support/templates/:id
POST  /api/support/templates/preview
```

#### Restricted maintenance and diagnostics

```text
POST /api/support/admin/purge-tickets
GET  /api/_sentry-test
```

The purge and Sentry test endpoints must remain disabled by default in production.

### 4.5 Current authentication and authorization

- The API creates an HTTP-only `support_session` cookie.
- Sessions are stateless HMAC-signed tokens with a 12-hour lifetime.
- The cookie uses `SameSite=Lax`.
- The cookie is marked `Secure` in production.
- All API instances must use the same signing secret.
- Database-backed support users are the primary login method.
- A legacy shared-password and email-allowlist fallback still exists.
- Registration currently creates a `support_admin`.
- Public ticket tracking uses a separate signed, short-lived ticket token.
- Permissions are checked server-side.

Current roles:

```text
support_admin
support_agent
product_owner
developer
qa_verifier
viewer
reporter
```

Critical migration requirement: unrestricted administrator registration must be disabled, invite-gated, IP-restricted, or replaced with an identity provider before public AWS launch.

### 4.6 Current database

The schema contains 14 tables:

1. `support_organisations`
2. `support_products`
3. `support_tickets`
4. `support_ticket_sequences`
5. `support_ticket_internal_notes`
6. `support_ticket_status_history`
7. `support_ticket_attachments`
8. `support_ticket_messages`
9. `support_ticket_linear_links`
10. `support_ticket_sentry_links`
11. `support_message_templates`
12. `support_settings`
13. `support_ticket_audit_log`
14. `support_users`

The schema uses UUIDs, PostgreSQL enums, `timestamptz`, JSONB, foreign keys, cascading ticket-child deletion, unique product and organisation codes, unique ticket references, unique sequence scopes, and unique support-user email addresses.

The current schema process uses `drizzle-kit push` and `push-force`. A migration journal with reviewed, versioned SQL migrations is not currently present and must be added before RDS production deployment.

### 4.7 Current attachment storage

- Attachments are stored on the local filesystem.
- Metadata is stored in PostgreSQL.
- The default path is `.local-storage/attachments`.
- Files are separated by ticket.
- Upload processing currently buffers one file in memory.
- File extension, MIME type, size, and magic bytes are validated.
- Images have a 10 MiB limit.
- PDFs have a 15 MiB limit.
- MP4 and MOV files have a 50 MiB limit.
- Downloads are authorization-gated through the API.

Local storage is not safe for replaceable or horizontally scaled EC2 instances.

### 4.8 Current external integrations

| Integration | Purpose |
|---|---|
| Resend | Support email delivery |
| Twilio/WhatsApp provider | Ticket notifications and communication |
| Linear | Engineering escalation and issue links |
| Sentry | Frontend and backend error monitoring |
| Hermes webhook | Outbound ticket lifecycle notifications |

Several integration and audit operations currently run as unawaited, fire-and-forget work. There is no durable queue or worker.

## 5. Target architecture

```text
Users and external clients
          |
          v
https://dogmacommand.center
          |
          v
       Vercel
   React/Vite SPA
          |
          | /api/* rewrite
          v
AWS Application Load Balancer
          |
          v
EC2 Auto Scaling Group
Express API instances
     |             |
     |             +----> Private S3 bucket
     |
     +------------------> Amazon RDS PostgreSQL
     |
     +------------------> Resend / Twilio / Linear / Sentry / Hermes
```

Recommended supporting services:

- Route 53 for AWS-controlled DNS records where required;
- AWS Certificate Manager for the API origin/ALB certificate;
- AWS Secrets Manager or SSM Parameter Store;
- CloudWatch Logs, metrics, dashboards, and alarms;
- AWS WAF on the ALB;
- Amazon ECR for immutable API container images;
- AWS Systems Manager Session Manager instead of public SSH;
- SQS plus a worker for durable outbound work;
- VPC endpoints for S3 and AWS management services where practical.

## 6. Domain and routing design

### 6.1 Public URL contract

The public contract remains:

```text
Frontend: https://dogmacommand.center/*
API:      https://dogmacommand.center/api/*
```

### 6.2 Origin design

Create a private implementation hostname for the API, for example:

```text
https://api-origin.dogmacommand.center
```

Vercel rewrites `/api/:path*` to the API origin. Browser clients continue to call `dogmacommand.center/api/*`.

The origin hostname must:

- terminate HTTPS;
- point to the AWS ALB;
- not be advertised as the client API;
- reject unexpected host/origin traffic where practical;
- be protected by WAF and security groups.

### 6.3 Vercel rewrites

Required behavior:

1. Forward `/api/*` to the AWS API origin.
2. Serve hashed static assets normally.
3. Rewrite remaining application routes to `/index.html`.
4. Do not rewrite `/api/*` to frontend HTML.
5. Forward `Cookie`, `Set-Cookie`, method, body, query, and relevant forwarding headers.
6. Do not cache authenticated API responses.

Illustrative configuration:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://api-origin.dogmacommand.center/api/:path*"
    },
    {
      "source": "/((?!api/|assets/).*)",
      "destination": "/index.html"
    }
  ]
}
```

The final configuration must be tested against Vercel rewrite precedence and static asset handling.

## 7. Frontend migration specification

### 7.1 Build

- Install with pnpm from the monorepo root.
- Build `@workspace/web`.
- Set `BASE_PATH=/` during build or remove the current mandatory build-time requirement.
- Do not require a runtime `PORT` for a static Vercel build.
- Publish `artifacts/web/dist/public`.
- Ensure workspace packages are available during the Vercel build.
- Keep generated API client code synchronized with OpenAPI.

### 7.2 API access

- Preserve relative `/api/*` requests.
- Standardize handwritten fetch calls and generated-client calls on one API transport.
- Continue sending credentials for support-session requests.
- Do not embed the AWS origin in browser code if the Vercel rewrite is used.
- Do not place private keys or provider secrets in `VITE_*` variables.

### 7.3 SPA requirements

- Direct navigation to every public and admin route must work.
- Browser refresh on nested routes must not return 404.
- Static files must use immutable caching.
- `index.html` must use no-cache or short revalidation.
- Authenticated API responses must not be cached by Vercel.

### 7.4 Frontend security headers

Define and test:

- `Content-Security-Policy`;
- `Strict-Transport-Security` after domain validation;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy`;
- `Permissions-Policy`;
- frame restrictions using CSP `frame-ancestors`.

### 7.5 Frontend observability

- Configure `VITE_SENTRY_DSN_WEB` at build time.
- Add release identifiers.
- Upload production source maps securely.
- Exclude source maps from public browsing if uploaded directly to Sentry.

## 8. Backend migration specification

### 8.1 Runtime

- Node.js 24.
- `NODE_ENV=production`.
- Build with the existing esbuild process.
- Run the immutable `dist/index.mjs` artifact.
- Bind to a configured application port.
- Place the API behind an ALB.
- Run EC2 instances in private subnets.
- Do not assign public IP addresses to API instances.
- Use Session Manager for emergency access.

### 8.2 Packaging and deployment

Preferred approach:

1. Build an OCI image.
2. Push the versioned image to ECR.
3. Launch it using an EC2 Auto Scaling Group and Launch Template.
4. Deploy by replacing instances using an instance refresh.

An AMI-based deployment is acceptable, but ad hoc file copying to a long-lived EC2 instance is not.

### 8.3 Load balancer

- HTTPS listener on port 443.
- ACM certificate on the API origin.
- Forward to the application port.
- Health check: `GET /api/healthz`.
- Add a readiness endpoint that verifies database connectivity and required schema version.
- Configure upload-compatible idle timeout.
- Restrict EC2 ingress to the ALB security group.
- Enable ALB access logs.

### 8.4 Application lifecycle

Add:

- SIGTERM and SIGINT handling;
- stop accepting new traffic during shutdown;
- HTTP server draining;
- PostgreSQL pool closure;
- queue worker shutdown;
- deployment timeout and rollback;
- startup failure when required secrets are absent.

### 8.5 CORS and proxy behavior

- Replace unrestricted `cors()` with an explicit allowlist.
- Set Express `trust proxy` correctly behind the ALB and Vercel.
- Validate `Origin` on authenticated state-changing requests.
- Preserve secure-cookie behavior through forwarded HTTPS headers.
- Prefer same-origin browser traffic through Vercel.

### 8.6 Durable background work

Move the following to a durable outbox/SQS worker:

- email sending;
- WhatsApp sending;
- Hermes lifecycle delivery;
- non-critical audit delivery where appropriate;
- attachment scanning;
- reconciliation jobs.

Every job must be:

- idempotent;
- retryable with bounded backoff;
- observable;
- dead-lettered after repeated failure;
- traceable to a ticket and audit record.

## 9. Amazon RDS specification

### 9.1 Service

Use Amazon RDS for PostgreSQL with:

- PostgreSQL version compatible with the source database;
- private subnets;
- no public accessibility;
- encryption at rest;
- TLS in transit;
- Multi-AZ for production;
- automated backups and point-in-time recovery;
- deletion protection;
- performance and storage monitoring;
- controlled maintenance window.

### 9.2 Access

Use two database identities:

1. **Application role:** normal application CRUD only.
2. **Migration role:** schema changes, used only by the deployment migration job.

Credentials must be stored in AWS Secrets Manager or SSM Parameter Store.

### 9.3 Connection management

Define:

- pool maximum per EC2 instance;
- connection timeout;
- idle timeout;
- statement timeout;
- TLS certificate verification;
- retry behavior after failover;
- maximum instance count relative to the RDS connection limit.

RDS Proxy can be added if connection pressure or frequent instance replacement requires it.

### 9.4 Schema migrations

Before production migration:

- replace schema push as the production mechanism;
- generate versioned SQL migrations;
- review every migration;
- record applied versions;
- execute migrations as a single controlled job;
- take a snapshot before destructive changes;
- use expand/contract changes for rolling compatibility;
- never run `push-force` automatically against production.

### 9.5 Data migration

Use `pg_dump` and `pg_restore` in a tested rehearsal.

Preserve:

- UUIDs;
- PostgreSQL enums;
- foreign keys;
- unique indexes;
- timestamp time zones;
- JSONB data;
- audit and status-history order;
- ticket sequence counters;
- support-user hashes and active states.

Validation must include:

- row count by table;
- sample and aggregate checksums;
- foreign-key consistency;
- unique-index validation;
- ticket-child cardinality;
- maximum timestamps;
- ticket sequence reconciliation;
- login and ticket creation tests.

## 10. Amazon S3 specification

### 10.1 Bucket configuration

- Private bucket.
- Block Public Access enabled.
- Object ownership enforced.
- Versioning enabled.
- Server-side encryption using SSE-KMS or approved SSE-S3 policy.
- Access logging or CloudTrail data events.
- Lifecycle policy for old versions and incomplete multipart uploads.
- Retention policy agreed with the business.
- Optional VPC endpoint for private S3 traffic.

### 10.2 IAM

EC2 uses an instance role. Do not place static AWS keys in application environment variables.

Minimum object permissions should be limited to the application prefix:

```text
s3:PutObject
s3:GetObject
s3:DeleteObject
s3:HeadObject
s3:ListBucket with prefix restriction
```

KMS permissions must be limited to the selected key and required actions.

### 10.3 Object key design

Recommended deterministic key:

```text
support-attachments/{ticketId}/{attachmentId}/{safeFileName}
```

The database stores the object key, not a public URL.

### 10.4 Upload flow

First migration release should preserve the existing API:

```text
POST /api/support/tickets/:id/attachments
```

The API:

1. authenticates and authorizes the caller;
2. validates size, MIME, extension, and magic bytes;
3. scans or quarantines the file where required;
4. uploads to S3;
5. writes attachment metadata;
6. records an audit event;
7. compensates or reconciles if either S3 or database work fails.

Large files should be streamed instead of fully buffered in application memory.

### 10.5 Download flow

Keep:

```text
GET /api/support/tickets/:id/attachments/:attachmentId
```

Preferred compatibility mode:

- API authorizes access;
- API streams the S3 object or returns a very short-lived signed URL;
- bucket and permanent object URLs remain private;
- response preserves safe content type and content disposition.

### 10.6 Existing attachment migration

1. Inventory database attachment rows and source files.
2. Detect missing and orphaned files.
3. Generate checksums and a migration manifest.
4. Upload idempotently using deterministic keys.
5. Verify S3 object size and checksum.
6. Update metadata only after verification.
7. Run a final delta copy after write freeze or dual-write period.
8. Keep source files until the acceptance and rollback window ends.

## 11. Authentication and security changes

### 11.1 Required before cutover

- Disable unrestricted administrator registration.
- Require stable, independent production signing secrets.
- Fail startup when signing secrets are missing.
- Remove or disable legacy shared-password login after administrator migration.
- Decide whether bearer support tokens remain permitted.
- Add CSRF protection for cookie-authenticated mutations.
- Add rate limiting to login, registration, public ticket creation, verification, replies, uploads, email testing, and integration actions.
- Add bot protection to public forms where abuse risk warrants it.
- Validate origin and host headers.
- Correct session documentation to match the implemented cookie.

### 11.2 Recommended identity target

Preferred long-term target:

- managed OIDC identity provider;
- MFA for administrators;
- per-user identities;
- server-side revocation or short-lived access plus refresh model;
- explicit invitation and role assignment;
- auditable account activation/deactivation.

The current session design can be retained for the first migration if the required hardening is completed.

### 11.3 Public ticket tokens

- Keep the public-ticket signing secret separate from the admin-session secret.
- Use short expiry.
- Avoid tokens in query strings where possible.
- Apply strict referrer policy.
- Never expose internal notes, SLA internals, audit logs, or private attachment keys.

## 12. Secrets and environment configuration

### 12.1 Backend secrets and settings

The migration must account for these names without copying values into source control:

```text
DATABASE_URL
PORT
NODE_ENV
LOG_LEVEL
SENTRY_DSN_API
SUPPORT_AUTH_SECRET
SESSION_SECRET
SUPPORT_AUTH_PASSWORD
SUPPORT_REPORTER_PASSWORD
SUPPORT_ADMIN_EMAILS
SUPPORT_AGENT_EMAILS
SUPPORT_PRODUCT_OWNER_EMAILS
SUPPORT_DEVELOPER_EMAILS
SUPPORT_QA_EMAILS
SUPPORT_VIEWER_EMAILS
SUPPORT_REPORTER_EMAILS
SUPPORT_PUBLIC_TICKET_SECRET
SUPPORT_ENABLE_PURGE_ENDPOINT
RESEND_API_KEY
SUPPORT_EMAIL_FROM
SUPPORT_EMAIL_REPLY_TO
LINEAR_API_KEY
LINEAR_DEFAULT_TEAM_ID
LINEAR_TEAM_ID_<PRODUCT_CODE>
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_FROM
WHATSAPP_FROM_NUMBER
WHATSAPP_PROVIDER
WHATSAPP_WEBHOOK_SECRET
HERMES_WEBHOOK_URL
HERMES_WEBHOOK_SECRET
HERMES_WEBHOOK_ENABLED
ENABLE_SENTRY_TEST_ENDPOINT
```

New AWS settings will include names for:

```text
AWS_REGION
SUPPORT_ATTACHMENTS_BUCKET
SUPPORT_ATTACHMENTS_PREFIX
SUPPORT_ATTACHMENTS_KMS_KEY_ID
SQS_OUTBOUND_QUEUE_URL
SQS_OUTBOUND_DLQ_URL
```

Prefer IAM roles over AWS access-key environment variables.

### 12.2 Frontend build variables

```text
BASE_PATH
VITE_SENTRY_DSN_WEB
VITE_ENABLE_BOUNDARY_TEST
```

Production must not enable the boundary test route.

## 13. Observability and operations

### 13.1 Logs

- Send structured Pino output to CloudWatch Logs.
- Keep authorization, cookies, credentials, tokens, and sensitive query data redacted.
- Define log retention.
- Add request ID propagation from Vercel and ALB to the API.
- Add ticket and audit correlation IDs without logging unnecessary personal data.

### 13.2 Metrics and alarms

Required alarms:

- ALB 5xx rate;
- target health;
- API latency;
- EC2 CPU, memory, and disk;
- RDS CPU, memory, storage, connections, and replica/failover events;
- SQS age and dead-letter count;
- S3 access-denied/error rate;
- failed login spikes;
- ticket creation failure rate;
- email and WhatsApp delivery failures;
- attachment reconciliation failures.

Through the rollback window, run the read-only hourly attachment reconciliation
described in `data-migration-rehearsal-and-cutover.md` from a private operations
host. It compares current attachment rows with the immutable cutover SHA-256
manifest and private S3 HEAD checksums/sizes, lists the attachment prefix for
unreferenced objects, retains timestamped restricted reports, and publishes
non-passing results to the on-call SNS topic. Configure an explicit UTC expiry
and disable/remove the schedule after acceptance. New writes need independent
durable checksum metadata before they can be declared reconciled.

### 13.3 Health endpoints

Maintain:

```text
GET /api/healthz
```

Add:

```text
GET /api/readyz
```

Readiness should verify:

- database connectivity;
- expected schema version;
- required configuration;
- S3 access at an appropriate lightweight level.

External providers should be reported through integration status and monitoring, not make every readiness probe fail.

## 14. Backup and disaster recovery

### 14.1 RDS

- Automated backups and PITR.
- Manual pre-migration snapshot.
- Cross-account or cross-region backup if business requirements demand it.
- Restore test before cutover.

### 14.2 S3

- Versioning.
- Lifecycle retention.
- Optional replication based on recovery requirements.
- Object inventory or migration manifest.
- Restore/deletion recovery test.

### 14.3 Required business decisions

Define:

- Recovery Point Objective (RPO).
- Recovery Time Objective (RTO).
- Ticket and attachment retention.
- Audit-log retention.
- Acceptable maintenance window.

## 15. CI/CD specification

### 15.1 Pull request checks

```text
pnpm install --frozen-lockfile
pnpm run typecheck
API contract generation consistency check
unit/integration tests
security dependency audit
container build
frontend build
```

The install lifecycle must be made reproducible; the current preinstall script deletes alternative lockfiles and should not mutate CI state.

### 15.2 Frontend deployment

- Vercel preview for pull requests.
- Production deployment from the approved production branch.
- Environment-specific variables.
- Manual approval for production if required.
- Post-deploy SPA and API rewrite checks.

### 15.3 Backend deployment

- Build and scan image.
- Push immutable image tag to ECR.
- Run database migration job once.
- Start EC2 instance refresh.
- Wait for ALB health.
- Run production smoke tests.
- Automatically stop or roll back on failed health criteria.

## 16. Migration workstreams

### Workstream 1: Application hardening

- Close or restrict administrator registration.
- Add production secret validation.
- Restrict CORS.
- Add CSRF and rate limiting.
- Add graceful shutdown and readiness.
- Standardize API request handling.
- Decide whether to retain legacy login.

### Workstream 2: Database migration readiness

- Create versioned migrations.
- Provision RDS.
- Test schema migration.
- Rehearse dump and restore.
- Validate data.
- Document rollback.

### Workstream 3: S3 storage implementation

- Build storage adapter.
- Add S3 implementation.
- Preserve API routes.
- Add streaming and reconciliation.
- Build attachment migration utility.
- Rehearse file migration.

### Workstream 4: AWS infrastructure

- VPC and subnets.
- ALB, target group, TLS, and WAF.
- EC2 Launch Template and Auto Scaling Group.
- ECR.
- RDS.
- S3 and KMS.
- Secrets Manager/SSM.
- IAM roles.
- CloudWatch and alarms.
- SQS and dead-letter queue.

Infrastructure should be defined using Terraform, AWS CDK, or CloudFormation rather than manual console-only configuration.

### Workstream 5: Vercel

- Monorepo build configuration.
- SPA fallback.
- `/api/*` rewrite.
- headers and caching.
- production domain.
- preview environment policy.
- Sentry release configuration.

### Workstream 6: Data migration and cutover

- Data and attachment inventory.
- Rehearsal migration.
- Final backup.
- Write freeze or dual-write.
- Final delta.
- validation.
- DNS/domain cutover.
- smoke testing.
- rollback decision window.

## 17. Recommended migration sequence

### Phase 0: Decisions

Approve:

- AWS region;
- RDS sizing and Multi-AZ requirement;
- EC2 instance size and initial desired count;
- Terraform/CDK/CloudFormation;
- maintenance-window or dual-write strategy;
- RPO/RTO;
- authentication target;
- S3 retention and KMS requirements;
- queue requirement for first release;
- budget and alert thresholds.

### Phase 1: Make the application portable

1. Remove production dependence on Replit runtime assumptions.
2. Make frontend Vercel build deterministic.
3. Add Vercel routes and API rewrites.
4. Add backend graceful shutdown and readiness.
5. Add strict production configuration validation.
6. Add controlled CORS, CSRF, and rate limits.
7. Add versioned database migrations.

### Phase 2: Introduce S3 without cutover

1. Add a storage interface.
2. Retain local storage implementation.
3. Add S3 implementation.
4. Add dual-read support.
5. Optionally enable dual-write.
6. Add checksums and reconciliation.
7. Test uploads and downloads against a staging bucket.

### Phase 3: Provision staging

1. Provision complete AWS staging environment.
2. Deploy API.
3. Restore a sanitized database copy.
4. Migrate copied attachments.
5. Deploy a Vercel preview/staging frontend.
6. Execute end-to-end migration tests.

### Phase 4: Rehearse production migration

1. Time the database export and restore.
2. Time attachment copy and delta.
3. Validate counts and checksums.
4. Test rollback.
5. Produce the final runbook with named owners.

### Phase 5: Production cutover

1. Lower relevant DNS TTL in advance.
2. Announce maintenance window if used.
3. Disable or freeze writes.
4. Take final database backup.
5. Export and restore to RDS.
6. Run final attachment delta.
7. Validate RDS and S3.
8. Deploy AWS API.
9. Validate the origin privately.
10. Deploy Vercel frontend and `/api` rewrite.
11. Move `dogmacommand.center`.
12. Run smoke and reconciliation checks.
13. Re-enable writes.
14. Monitor continuously through the rollback window.

### Phase 6: Decommission

Only after acceptance:

1. Keep the Replit deployment read-only during the agreed rollback window.
2. Preserve final backups and migration manifests.
3. Revoke obsolete credentials.
4. Remove old DNS routes.
5. Decommission source services.
6. Update operational documentation.

## 18. Cutover validation

### 18.1 Frontend

- Home redirects correctly.
- Every public route loads on direct navigation and refresh.
- Every admin route loads on direct navigation and refresh.
- Static assets and favicon load.
- No requests target Replit development domains.

### 18.2 Authentication

- Register behavior matches the approved security decision.
- Existing database users can sign in.
- Sessions persist across API instances.
- Logout invalidates browser access.
- Role permissions are enforced server-side.
- Disabled users cannot sign in.

### 18.3 Tickets

- Products load.
- Public ticket creation works.
- Admin ticket list and detail work.
- Ticket updates persist.
- Notes and messages persist.
- Status history is correct.
- Public verification, viewing, replies, and messages work.

### 18.4 Attachments

- Each supported type uploads within its limit.
- Invalid extension/MIME/magic bytes are rejected.
- Authorized download works.
- Unauthorized download fails.
- Delete removes logical access and follows retention policy.
- Migrated attachments match the source checksums.

### 18.5 Integrations

- Resend test and ticket email.
- WhatsApp provider test where enabled.
- Linear status, issue creation, linking, and unlinking.
- Sentry frontend and backend test events.
- Hermes delivery and retries.

### 18.6 Operations

- ALB health and readiness.
- RDS backup and restore.
- S3 version recovery.
- queue retries and dead-letter behavior.
- CloudWatch logs and alarms.
- deployment rollback.

## 19. Rollback plan

Rollback must be possible independently for frontend, API, database, and storage.

### Frontend rollback

- Redeploy the previous Vercel production build.
- Keep API contract backward compatible.

### API rollback

- Revert the EC2 image using the previous immutable image tag.
- Keep database migrations backward compatible during the rollback window.

### Database rollback

- Prefer forward fixes for additive migrations.
- For failed destructive migration, restore the pre-cutover snapshot to a new RDS instance.
- Switch the API connection only after integrity validation.

### Storage rollback

- Preserve source attachments and S3 versions.
- Keep dual-read through the acceptance window.
- Never delete source files during initial cutover.

### Full-site rollback

- Freeze writes.
- Route `dogmacommand.center` back to the prior deployment.
- Reconcile any writes accepted by the target system before reopening the source.

## 20. Migration risks

| Risk | Required mitigation |
|---|---|
| Public administrator registration | Close, restrict, or replace before cutover |
| Unrestricted CORS | Explicit origin allowlist and CSRF protection |
| Local attachment storage | S3 adapter, migration manifest, dual-read |
| Fire-and-forget operations | Durable queue/outbox |
| Ephemeral session secret fallback | Fail startup when secret is absent |
| No versioned DB migrations | Add reviewed migration journal |
| No graceful shutdown | Drain HTTP, DB, and workers |
| Missing readiness checks | Add database/schema/S3 readiness |
| Large buffered uploads | Stream uploads and enforce limits |
| Source and target writes during copy | Maintenance window or dual-write/delta |
| API rewrite/cookie failure | Same-origin Vercel rewrite tests |
| RDS connection exhaustion | Pool sizing and capacity model |
| Secret exposure | Secrets Manager/SSM and instance roles |
| Unverified backups | Rehearsed restore before cutover |

## 21. Definition of done

The migration is complete when:

1. `https://dogmacommand.center` is served by Vercel.
2. `https://dogmacommand.center/api/*` is forwarded to the AWS API.
3. API routes retain their existing contracts.
4. Production data is served from RDS.
5. Attachments are served from private S3 through authorized flows.
6. Database and attachment reconciliation passes.
7. Authentication and permissions pass acceptance tests.
8. Integrations pass approved production tests.
9. Backups, restore tests, logs, metrics, and alarms are operational.
10. A tested rollback path exists.
11. No production dependency remains on the Replit runtime.
12. The rollback window has ended without unresolved data-integrity issues.

## 22. Decisions required before implementation

1. Which AWS region must host the workload and data?
2. Is Multi-AZ RDS required at launch?
3. What are the required RPO and RTO?
4. Is a maintenance window acceptable, or is near-zero downtime required?
5. Should authentication be hardened in place or moved to an OIDC provider?
6. Should public administrator registration be removed, invitation-only, or network-restricted?
7. Is SQS required in the first AWS release, or may durable background processing follow immediately after cutover?
8. Is SSE-S3 sufficient, or is customer-managed KMS required?
9. What attachment and audit retention periods apply?
10. Which infrastructure-as-code tool will be used?
11. Which CI/CD platform will deploy Vercel and AWS?
12. What monthly AWS/Vercel budget and alert thresholds apply?

## 23. Implementation deliverables

- Approved architecture diagram.
- Infrastructure-as-code repository/module.
- Vercel project configuration.
- EC2 API image and deployment pipeline.
- RDS schema migration journal and migration runner.
- S3 storage adapter and migration utility.
- SQS/outbox worker if included in launch scope.
- Security hardening changes.
- Environment and secrets matrix.
- Staging environment.
- Data migration manifest and reconciliation report.
- Production cutover runbook.
- Rollback runbook.
- Monitoring and alerting dashboard.
- Operations handbook.
- Post-migration acceptance report.
