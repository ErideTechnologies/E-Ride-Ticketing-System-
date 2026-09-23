# Data migration rehearsal, cutover, and rollback

## Scope and safety

This runbook transfers the 14 support tables and attachment objects. It preserves
source UUIDs, enums, relationships, timestamps, JSON, support users, password
hashes, and ticket sequence rows by using PostgreSQL custom-format dump/restore.

The source remains authoritative until cutover acceptance. Never delete source
files during the rollback window. Never run the database rehearsal against a
target that contains data that must be retained: restore uses `--clean`.
The rehearsal proves source and target PostgreSQL cluster/database identities
before restore and fails closed when identity cannot be established.

Store generated `migration-evidence/` outside source control in the restricted
operations evidence location. Reports contain hashes and identifiers and must not
be published.

## Prerequisites

- PostgreSQL client tools compatible with source and target.
- A new empty rehearsal RDS database and a migration role with restore rights.
- AWS CLI v2 using an IAM role with prefix-limited `ListBucket`, `HeadObject`,
  `GetObject`, and `PutObject` permissions.
- A private S3 bucket with Block Public Access, encryption, and versioning.
- Network access to source PostgreSQL, RDS, and S3.
- Approved owners for application freeze, database, storage, validation, DNS,
  and rollback.

Do not put database URLs or AWS credentials in commands saved to shell history.
Provide them through the approved secret injection mechanism.

## Rehearsal

### Executed baseline (2026-09-22 UTC)

A disposable PostgreSQL database on the development database service was used to
exercise the complete custom-format dump, clean restore, and reconciliation path.
The 14-table rehearsal passed with an empty diff: 40,418-byte dump, 490 ms dump,
893 ms restore, and 1,791 ms total including validation. Enum definitions,
14 foreign keys, 14 primary/unique constraints, all rows, samples, relationships,
timestamps, users, and ticket sequence invariants matched.

The development attachment inventory passed with zero attachment rows, zero
source files, and zero orphans. A read-only production baseline reported 27
tickets, 27 messages, 20 audit rows, 12 templates, three products, one user, and
zero attachment rows. Because the production database interface is read-only and
the AWS staging target is provisioned separately, the live-data dump/restore must
be rerun from the approved migration host once RDS access is available. With zero
production attachment rows, there are currently no production objects to copy;
rerun inventory after the write freeze to catch any later uploads.

### 1. Database export and restore

Run against a disposable target:

```sh
SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... \
  pnpm --filter @workspace/scripts migration:database
```

The command records dump, restore, and total duration. It fails unless source and
target match on every table row count and whole-row digest, enum definitions,
foreign keys, primary/unique constraints, deterministic ticket/user samples,
ticket-child integrity, and ticket sequence reconciliation. Retain `result.json`,
both snapshots, the empty reconciliation diff, and the dump checksum.

Afterward, use the staging application to sign in with a migrated active user,
open sampled old tickets, and create one rehearsal ticket. Confirm its reference
is exactly one above the prior sequence, then discard the rehearsal target.

### 2. Attachment inventory

Run on a host that can see the source attachment directory:

```sh
DATABASE_URL=... SUPPORT_ATTACHMENTS_DIR=... \
  pnpm --filter @workspace/scripts migration:attachments -- inventory
```

Stop if any database row is missing a file or has a size mismatch. Review
`orphan-files.tsv`; classify every orphan before cutover, but do not delete it.
The manifest contains one deterministic S3 key and SHA-256 checksum per row.
Copy re-checks file size and SHA-256 immediately before each upload or skip and
fails if the source changed after inventory.
Paths outside `SUPPORT_ATTACHMENTS_DIR` are rejected and never read or uploaded.

### 3. Idempotent S3 copy

```sh
DATABASE_URL=... SUPPORT_ATTACHMENTS_BUCKET=... AWS_REGION=... \
  pnpm --filter @workspace/scripts migration:attachments -- copy \
  migration-evidence/attachments-*/manifest.tsv
```

Run it twice. The first run may report `copied`; the second must report only
`skipped`. A skip is allowed only when S3 `ContentLength` and S3's independently
reported `ChecksumSHA256` both match the freshly recalculated local file. The
tool uploads privately and does not alter database metadata. Bucket policy must
enforce the selected SSE-S3 or SSE-KMS encryption.

### 4. Record rehearsal evidence

Record UTC start/end times, operator, source snapshot identifier, RDS endpoint
label, bucket/prefix label, dump size/checksum, all result files, second-copy
result, application smoke results, and issues. Set the maintenance window to the
measured database dump + restore + final attachment delta + validation duration,
plus at least 50% contingency. Rehearse rollback before approval.

## Production cutover

1. Confirm all prerequisite tasks and security gates are complete.
2. Confirm owners, communication channel, rollback authority, and deadline.
3. Confirm a fresh RDS snapshot, S3 versioning, old deployment, and DNS rollback.
4. Record baseline row counts and attachment inventory; resolve all problems.
5. Announce maintenance and freeze every source write path. Verify with logs.
6. Record the freeze timestamp and take the final PostgreSQL custom dump.
7. Restore to RDS and run the database reconciliation command.
8. Create a fresh attachment inventory and run the idempotent final S3 delta.
9. Require zero database differences, zero attachment failures, and no
   unexplained orphans. Do not proceed on a partial pass.
10. Deploy the AWS API against RDS/S3 and validate it privately.
11. Test migrated-user login, sampled tickets and child records, authorized and
    unauthorized attachment access, and creation of the next ticket reference.
12. Deploy the Vercel frontend/rewrite, move traffic, and repeat smoke checks.
13. Re-enable writes only after the migration owner signs the evidence record.
14. Monitor errors, database integrity, S3 failures, and sequence allocation
    through the agreed rollback window. Keep the source read-only and intact.

### Scheduled attachment reconciliation during rollback

Before re-enabling target writes, keep the **final, verified** `manifest.tsv`
from the write-freeze inventory in restricted, durable storage. This is the
independent SHA-256 baseline for migrated objects; do not regenerate it from
S3 after cutover. The target database supplies current attachment IDs, sizes,
and storage keys; legacy local paths resolve to deterministic migration keys.
New rows without an entry in the cutover baseline are flagged for investigation,
not silently trusted. For approved new writes, optionally supply a separate,
operator-controlled `ATTACHMENT_RECONCILE_ADDITIONS` TSV with header
`attachment_id	object_key	expected_bytes	sha256` and one row per attachment.
Obtain SHA-256 at ingestion from the original upload (not by reading the S3
object under investigation), append under change control, and retain prior
versions as evidence. The file must not repeat IDs in the cutover manifest.
If the S3 write path cannot supply this independent checksum, alerts for new
rows remain open; do not attest that reconciliation passed.

On a private operations host with read-only RDS access and an IAM role allowing
only `s3:ListBucket` on the attachment prefix, `s3:GetObject` for HEAD (and
`kms:Decrypt` if checksums require it), and `sns:Publish` on the alarm topic,
schedule this command hourly. Install a cron entry with an absolute project
path and secret injection appropriate to the host (not a checked-in credential
file); for example:

```cron
0 * * * * /usr/bin/flock -n /opt/support/migration-evidence/reconcile.lock /bin/bash /opt/support/scripts/migration/run-attachment-reconcile.sh
```

Inject credentials and settings into the cron environment through the approved
host secret mechanism, rather than writing them in the crontab. The checked-in
wrapper changes to the project directory and executes the package command.
Set `DATABASE_URL`, `SUPPORT_ATTACHMENTS_BUCKET`, `AWS_REGION`,
`ATTACHMENT_RECONCILE_MANIFEST` (absolute path to the final manifest),
`ATTACHMENT_RECONCILE_REPORT_DIR` (restricted, durable, **not** inside S3's
attachment prefix), `ATTACHMENT_RECONCILE_SNS_TOPIC_ARN`, optionally
`ATTACHMENT_RECONCILE_ADDITIONS`,
`ATTACHMENT_RECONCILE_ENABLED=true`, and
`ATTACHMENT_RECONCILE_UNTIL=YYYY-MM-DDTHH:MM:SSZ` (the agreed UTC acceptance
deadline). The wrapper must forward nonzero exit status to host job-failure
monitoring, including missed runs; a locked-out or failed run is not a pass.
Configure and verify SNS delivery to the on-call operations channel before
cutover. Do not point the job at a public bucket.

Each run writes a uniquely timestamped, mode-0600 JSON report under the
restricted directory (directory mode 0700); the report has counts and object
keys, not credentials or public URLs. Retain reports through the rollback
window and incident review under the restricted evidence retention policy.
The job issues only database SELECT and S3 HEAD/LIST; it never uploads,
deletes, or changes metadata. Any missing/unreadable object, size or SHA-256
checksum mismatch, missing checksum/baseline, missing database row, unexpected
object, or check error generates an SNS alert and a nonzero exit. Investigate
the evidence and apply the rollback decision criteria below; do not auto-repair.
Run once manually before enabling cron and exercise alert delivery with an
isolated test fixture. After acceptance, set
`ATTACHMENT_RECONCILE_ENABLED=false` and remove the cron entry; the UTC
deadline also stops runs even if the entry is inadvertently left installed.

## Rollback

Trigger rollback for any unexplained reconciliation difference, missing or
incorrect attachment, failed authentication, duplicate/incorrect ticket
sequence, sustained API errors, or inability to complete before the deadline.

1. Freeze target writes and record the exact rollback timestamp.
2. Export target writes accepted after the original freeze for later
   reconciliation. Do not silently discard them.
3. Route traffic to the prior frontend/API deployment.
4. If the source is still intact, reconcile target-only writes back under an
   approved procedure, validate, then reopen source writes.
5. If RDS itself must roll back, restore the pre-cutover snapshot to a **new**
   RDS instance, validate it, and only then switch the API connection.
6. Preserve S3 objects and versions; switch storage reads back to source. Do not
   delete copied objects during incident response.
7. Repeat row, relationship, sequence, attachment, login, and ticket smoke
   checks before announcing recovery.
8. Preserve all evidence and open an incident review before rescheduling.

## Acceptance record

Cutover is accepted only when database reconciliation is exact, attachment rows
and objects reconcile by count/size/SHA-256, sampled records and relationships
match, migrated users can authenticate, the next ticket sequence is correct,
smoke checks pass, and monitoring stays clean through the rollback window.