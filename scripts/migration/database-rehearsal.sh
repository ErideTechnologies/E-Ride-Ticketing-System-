#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  SOURCE_DATABASE_URL=... TARGET_DATABASE_URL=... pnpm --filter @workspace/scripts migration:database -- [output-dir]

The target database is erased and restored from the source dump. Never point
TARGET_DATABASE_URL at a database containing data that must be retained.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then usage; exit 0; fi
: "${SOURCE_DATABASE_URL:?SOURCE_DATABASE_URL is required}"
: "${TARGET_DATABASE_URL:?TARGET_DATABASE_URL is required}"
if [[ "$SOURCE_DATABASE_URL" == "$TARGET_DATABASE_URL" ]]; then
  echo "Refusing to use the source database as the restore target." >&2
  exit 2
fi

database_identity() {
  local url="$1"
  psql "$url" -X -v ON_ERROR_STOP=1 -AtF / -c \
    "SELECT system_identifier,current_database() FROM pg_control_system()"
}

# URL strings are not sufficient: aliases, users, and query parameters can all
# differ while identifying the same database. Refuse to restore unless both
# endpoints can prove their cluster/database identity and those identities differ.
source_identity="$(database_identity "$SOURCE_DATABASE_URL")" || {
  echo "Could not prove source database identity; refusing destructive restore." >&2
  exit 2
}
target_identity="$(database_identity "$TARGET_DATABASE_URL")" || {
  echo "Could not prove target database identity; refusing destructive restore." >&2
  exit 2
}
if [[ -z "$source_identity" || -z "$target_identity" || "$source_identity" == "$target_identity" ]]; then
  echo "Source and target database identities are equal or uncertain; refusing destructive restore." >&2
  exit 2
fi

out="${1:-migration-evidence/database-$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$out"
dump="$out/source.dump"
tables=(
  support_organisations support_products support_tickets support_ticket_sequences
  support_ticket_internal_notes support_ticket_status_history
  support_ticket_attachments support_ticket_messages
  support_ticket_linear_links support_ticket_sentry_links
  support_message_templates support_settings support_ticket_audit_log support_users
)

now_ms() { date +%s%3N; }
duration() { echo $(( $(now_ms) - $1 )); }

snapshot() {
  local url="$1" file="$2"
  {
    echo -e "kind\tname\tcount\tdigest_or_value"
    for table in "${tables[@]}"; do
      psql "$url" -X -v ON_ERROR_STOP=1 -AtF $'\t' -c \
        "SELECT 'table', '$table', count(*), coalesce(md5(string_agg(md5(to_jsonb(t)::text), '' ORDER BY md5(to_jsonb(t)::text))), md5('')) FROM public.$table t"
    done
    psql "$url" -X -v ON_ERROR_STOP=1 -AtF $'\t' <<'SQL'
SELECT 'schema','enum',count(*),md5(string_agg(enumtypid::regtype::text||'='||enumlabel,',' ORDER BY enumtypid::regtype::text,enumsortorder))
FROM pg_enum;
SELECT 'schema','foreign_key',count(*),md5(string_agg(conname||'='||pg_get_constraintdef(oid),',' ORDER BY conname))
FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace;
SELECT 'schema','unique_or_primary',count(*),md5(string_agg(conname||'='||pg_get_constraintdef(oid),',' ORDER BY conname))
FROM pg_constraint WHERE contype IN ('p','u') AND connamespace='public'::regnamespace;
SELECT 'invariant','orphan_ticket_children',count(*),count(*)::text FROM (
  SELECT a.support_ticket_id FROM support_ticket_attachments a LEFT JOIN support_tickets t ON t.id=a.support_ticket_id WHERE t.id IS NULL
  UNION ALL SELECT m.support_ticket_id FROM support_ticket_messages m LEFT JOIN support_tickets t ON t.id=m.support_ticket_id WHERE t.id IS NULL
  UNION ALL SELECT n.support_ticket_id FROM support_ticket_internal_notes n LEFT JOIN support_tickets t ON t.id=n.support_ticket_id WHERE t.id IS NULL
  UNION ALL SELECT h.support_ticket_id FROM support_ticket_status_history h LEFT JOIN support_tickets t ON t.id=h.support_ticket_id WHERE t.id IS NULL
) broken;
SELECT 'invariant','ticket_sequence_behind',count(*),count(*)::text
FROM support_ticket_sequences s
WHERE s.last_sequence < coalesce((
  SELECT max((regexp_match(t.ticket_reference, '([0-9]+)$'))[1]::integer)
  FROM support_tickets t
  WHERE t.organisation_id=s.organisation_id AND t.product_id=s.product_id
    AND extract(year FROM t.created_at)::integer=s.year
),0);
SELECT 'sample','tickets',count(*),coalesce(md5(string_agg(to_jsonb(x)::text,',' ORDER BY x.id)),md5(''))
FROM (SELECT * FROM support_tickets ORDER BY id LIMIT 20) x;
SELECT 'sample','users',count(*),coalesce(md5(string_agg(to_jsonb(x)::text,',' ORDER BY x.id)),md5(''))
FROM (SELECT * FROM support_users ORDER BY id LIMIT 20) x;
SQL
  } > "$file"
}

started="$(now_ms)"
dump_started="$(now_ms)"
pg_dump "$SOURCE_DATABASE_URL" --format=custom --no-owner --no-privileges --file="$dump"
dump_ms="$(duration "$dump_started")"
dump_sha256="$(sha256sum "$dump" | cut -d' ' -f1)"
printf '%s  %s\n' "$dump_sha256" "$(basename "$dump")" > "$out/source.dump.sha256"

restore_started="$(now_ms)"
pg_restore --dbname="$TARGET_DATABASE_URL" --clean --if-exists --no-owner \
  --no-privileges --exit-on-error "$dump"
restore_ms="$(duration "$restore_started")"

snapshot "$SOURCE_DATABASE_URL" "$out/source.tsv"
snapshot "$TARGET_DATABASE_URL" "$out/target.tsv"
diff -u "$out/source.tsv" "$out/target.tsv" > "$out/reconciliation.diff" || {
  echo "Database reconciliation failed; inspect $out/reconciliation.diff" >&2
  exit 1
}

cat > "$out/result.json" <<EOF
{
  "status": "passed",
  "completedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "dumpMilliseconds": $dump_ms,
  "restoreMilliseconds": $restore_ms,
  "totalMilliseconds": $(duration "$started"),
  "dumpBytes": $(stat -c %s "$dump"),
  "dumpSha256": "$dump_sha256",
  "tableCount": ${#tables[@]}
}
EOF
echo "Database rehearsal passed. Evidence: $out"