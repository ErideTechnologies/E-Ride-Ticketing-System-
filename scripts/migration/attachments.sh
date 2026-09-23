#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  DATABASE_URL=... SUPPORT_ATTACHMENTS_DIR=... pnpm --filter @workspace/scripts migration:attachments -- inventory [output-dir]
  DATABASE_URL=... SUPPORT_ATTACHMENTS_BUCKET=... AWS_REGION=... pnpm --filter @workspace/scripts migration:attachments -- copy <manifest.tsv> [output-dir]

The copy command requires AWS CLI v2 authenticated through an IAM role or
standard AWS credential chain. It never changes database metadata or deletes
source files. Objects use deterministic keys and are verified by size and S3's
native SHA-256 checksum after upload.
EOF
}

cmd="${1:-}"; shift || true
[[ "$cmd" == "inventory" || "$cmd" == "copy" ]] || { usage; exit 2; }
: "${DATABASE_URL:?DATABASE_URL is required}"
root="$(realpath -m "${SUPPORT_ATTACHMENTS_DIR:-.local-storage/attachments}")"
prefix="${SUPPORT_ATTACHMENTS_PREFIX:-support-attachments}"

if [[ "$cmd" == "inventory" ]]; then
  out="${1:-migration-evidence/attachments-$(date -u +%Y%m%dT%H%M%SZ)}"
  mkdir -p "$out"
  raw="$out/database-rows.tsv"
  manifest="$out/manifest.tsv"
  printf 'attachment_id\tticket_id\tstorage_path\texpected_bytes\tobject_key\tsha256\tstatus\n' > "$manifest"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -AtF $'\t' -c \
    "SELECT id,support_ticket_id,storage_path,file_size,file_name FROM support_ticket_attachments ORDER BY id" > "$raw"

  declare -A referenced=()
  missing=0; matched=0
  while IFS=$'\t' read -r id ticket path expected stored_name; do
    [[ -n "$id" ]] || continue
    if [[ "$path" = /* ]]; then file="$(realpath -m "$path")"; else file="$(realpath -m "$PWD/$path")"; fi
    if [[ "$file" != "$root" && "$file" != "$root/"* ]]; then
      key="$prefix/$ticket/$id/$(basename "$stored_name")"
      printf '%s\t%s\t%s\t%s\t%s\t\tunsafe-path\n' "$id" "$ticket" "$path" "$expected" "$key" >> "$manifest"
      missing=$((missing+1))
      continue
    fi
    referenced["$file"]=1
    key="$prefix/$ticket/$id/$(basename "$stored_name")"
    if [[ ! -f "$file" ]]; then
      printf '%s\t%s\t%s\t%s\t%s\t\tmissing\n' "$id" "$ticket" "$path" "$expected" "$key" >> "$manifest"
      missing=$((missing+1)); continue
    fi
    actual="$(stat -c %s "$file")"
    sha="$(sha256sum "$file" | cut -d' ' -f1)"
    status="matched"; [[ "$actual" == "$expected" ]] || status="size-mismatch"
    [[ "$status" == "matched" ]] && matched=$((matched+1)) || missing=$((missing+1))
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$id" "$ticket" "$path" "$expected" "$key" "$sha" "$status" >> "$manifest"
  done < "$raw"

  : > "$out/orphan-files.tsv"
  if [[ -d "$root" ]]; then
    while IFS= read -r -d '' file; do
      abs="$(realpath "$file")"
      [[ -n "${referenced[$abs]:-}" ]] || printf '%s\t%s\t%s\n' "$abs" "$(stat -c %s "$abs")" "$(sha256sum "$abs" | cut -d' ' -f1)" >> "$out/orphan-files.tsv"
    done < <(find "$root" -type f -print0)
  fi
  rows=$((matched+missing)); orphans="$(wc -l < "$out/orphan-files.tsv")"
  printf '{"status":"%s","rows":%d,"matched":%d,"problems":%d,"orphans":%d}\n' \
    "$([[ "$missing" -eq 0 ]] && echo passed || echo failed)" "$rows" "$matched" "$missing" "$orphans" > "$out/result.json"
  echo "Attachment inventory complete. Evidence: $out"
  [[ "$missing" -eq 0 ]]
  exit
fi

manifest="${1:?manifest.tsv is required}"; out="${2:-migration-evidence/attachment-copy-$(date -u +%Y%m%dT%H%M%SZ)}"
: "${SUPPORT_ATTACHMENTS_BUCKET:?SUPPORT_ATTACHMENTS_BUCKET is required}"
: "${AWS_REGION:?AWS_REGION is required}"
command -v aws >/dev/null || { echo "AWS CLI v2 is required for copy." >&2; exit 2; }
mkdir -p "$out"; report="$out/copy-report.tsv"
printf 'attachment_id\tobject_key\tbytes\tsha256\taction\tverified\n' > "$report"
copied=0; skipped=0; failed=0
tail -n +2 "$manifest" | while IFS=$'\t' read -r id ticket path expected key sha status; do
  [[ "$status" == "matched" ]] || { printf '%s\t%s\t%s\t%s\tsource-%s\tfalse\n' "$id" "$key" "$expected" "$sha" "$status" >> "$report"; continue; }
  [[ "$path" = /* ]] && file="$(realpath -m "$path")" || file="$(realpath -m "$PWD/$path")"
  if [[ "$file" != "$root" && "$file" != "$root/"* ]]; then
    echo "Refusing attachment path outside SUPPORT_ATTACHMENTS_DIR: $path" >&2
    exit 1
  fi
  [[ -f "$file" ]] || { echo "Source file disappeared after inventory: $path" >&2; exit 1; }
  current_size="$(stat -c %s "$file")"
  current_sha="$(sha256sum "$file" | cut -d' ' -f1)"
  if [[ "$current_size" != "$expected" || "$current_sha" != "$sha" ]]; then
    echo "Source file changed after inventory: $path" >&2
    exit 1
  fi
  checksum_b64="$(node -e 'process.stdout.write(Buffer.from(process.argv[1],"hex").toString("base64"))' "$current_sha")"
  remote="$(aws s3api head-object --bucket "$SUPPORT_ATTACHMENTS_BUCKET" --key "$key" --region "$AWS_REGION" --checksum-mode ENABLED 2>/dev/null || true)"
  remote_size="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{s=s.trim();if(s)process.stdout.write(String(JSON.parse(s).ContentLength??""))})' <<<"$remote")"
  remote_sha="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{s=s.trim();if(s)process.stdout.write(String(JSON.parse(s).ChecksumSHA256??""))})' <<<"$remote")"
  action="copied"
  if [[ "$remote_size" == "$expected" && "$remote_sha" == "$checksum_b64" ]]; then action="skipped"; else
    aws s3api put-object --bucket "$SUPPORT_ATTACHMENTS_BUCKET" --key "$key" --body "$file" \
      --region "$AWS_REGION" --checksum-algorithm SHA256 --checksum-sha256 "$checksum_b64" \
      --metadata "attachment-id=$id" >/dev/null
  fi
  verify="$(aws s3api head-object --bucket "$SUPPORT_ATTACHMENTS_BUCKET" --key "$key" --region "$AWS_REGION" --checksum-mode ENABLED)"
  vsize="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(String(JSON.parse(s).ContentLength??"")))' <<<"$verify")"
  vsha="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(String(JSON.parse(s).ChecksumSHA256??"")))' <<<"$verify")"
  ok=false; [[ "$vsize" == "$expected" && "$vsha" == "$checksum_b64" ]] && ok=true
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$id" "$key" "$expected" "$sha" "$action" "$ok" >> "$report"
done
failed="$(awk -F'\t' 'NR>1 && $6!="true"{n++} END{print n+0}' "$report")"
copied="$(awk -F'\t' 'NR>1 && $5=="copied"{n++} END{print n+0}' "$report")"
skipped="$(awk -F'\t' 'NR>1 && $5=="skipped"{n++} END{print n+0}' "$report")"
printf '{"status":"%s","copied":%d,"skipped":%d,"failed":%d}\n' \
  "$([[ "$failed" -eq 0 ]] && echo passed || echo failed)" "$copied" "$skipped" "$failed" > "$out/result.json"
echo "Attachment copy complete. Evidence: $out"
[[ "$failed" -eq 0 ]]