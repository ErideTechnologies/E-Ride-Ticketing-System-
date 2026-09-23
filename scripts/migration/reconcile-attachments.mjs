#!/usr/bin/env node
// Read-only rollback-window check. Never print command stderr: it may contain credentials.
import { execFileSync } from "node:child_process";
import { readFile, mkdir, stat, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const now = new Date();
const startedAt = now.toISOString();
const required = (name) => {
  if (!process.env[name]) throw new Error(`Missing ${name}`);
  return process.env[name];
};
const run = (command, args) =>
  execFileSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const aws = (...args) => JSON.parse(run("aws", [...args, "--output", "json"]));
const shaPattern = /^[a-f0-9]{64}$/i;
const libpqOptions = {
  host: "PGHOST", hostaddr: "PGHOSTADDR", port: "PGPORT", user: "PGUSER",
  password: "PGPASSWORD", dbname: "PGDATABASE", sslmode: "PGSSLMODE",
  sslrootcert: "PGSSLROOTCERT", sslcert: "PGSSLCERT", sslkey: "PGSSLKEY",
  sslcrl: "PGSSLCRL", sslcrldir: "PGSSLCRLDIR", sslpassword: "PGSSLPASSWORD",
  connect_timeout: "PGCONNECT_TIMEOUT", application_name: "PGAPPNAME",
  options: "PGOPTIONS", target_session_attrs: "PGTARGETSESSIONATTRS",
  channel_binding: "PGCHANNELBINDING", gssencmode: "PGGSSENCMODE",
  keepalives: "PGKEEPALIVES", keepalives_idle: "PGKEEPALIVES_IDLE",
  keepalives_interval: "PGKEEPALIVES_INTERVAL", keepalives_count: "PGKEEPALIVES_COUNT",
};

function connectionEnv(connectionUri) {
  let parsed;
  try { parsed = new URL(connectionUri); } catch { throw new Error("Invalid DATABASE_URL"); }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.pathname?.startsWith("/")) {
    throw new Error("Invalid DATABASE_URL");
  }
  const env = { ...process.env };
  for (const variable of Object.values(libpqOptions)) delete env[variable];
  delete env.PGSERVICE;
  delete env.PGSERVICEFILE;
  const database = decodeURIComponent(parsed.pathname.slice(1));
  if (!database) throw new Error("Invalid DATABASE_URL");
  env.PGDATABASE = database;
  if (parsed.hostname) env.PGHOST = parsed.hostname;
  if (parsed.port) env.PGPORT = parsed.port;
  if (parsed.username) env.PGUSER = decodeURIComponent(parsed.username);
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);
  for (const [name, value] of parsed.searchParams) {
    const variable = libpqOptions[name];
    if (!variable) throw new Error("Unsupported DATABASE_URL option");
    env[variable] = value;
  }
  return env;
}
const prefix = (process.env.SUPPORT_ATTACHMENTS_PREFIX || "support-attachments").replace(/\/+$/, "");
const report = {
  startedAt,
  finishedAt: null,
  status: "error",
  checked: 0,
  problems: [],
  counts: {},
};
let evidenceDir;

function problem(kind, attachmentId = null, objectKey = null) {
  report.problems.push({ kind, attachmentId, objectKey });
  report.counts[kind] = (report.counts[kind] || 0) + 1;
}

function alert(message) {
  const topic = required("ATTACHMENT_RECONCILE_SNS_TOPIC_ARN");
  run("aws", [
    "sns", "publish", "--topic-arn", topic, "--region", required("AWS_REGION"),
    "--subject", "Attachment reconciliation alert",
    "--message", message,
    "--output", "json",
  ]);
}

async function main() {
  // The cron entry may remain installed after acceptance; the job stops itself.
  const enabled = required("ATTACHMENT_RECONCILE_ENABLED");
  if (enabled !== "true" && enabled !== "false") {
    throw new Error("Invalid ATTACHMENT_RECONCILE_ENABLED");
  }
  if (enabled === "false") {
    report.status = "disabled";
    return;
  }
  const deadline = required("ATTACHMENT_RECONCILE_UNTIL");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(deadline) ||
      !Number.isFinite(Date.parse(deadline))) throw new Error("Invalid ATTACHMENT_RECONCILE_UNTIL");
  if (now >= new Date(deadline)) {
    report.status = "disabled";
    return;
  }
  evidenceDir = resolve(required("ATTACHMENT_RECONCILE_REPORT_DIR"));
  await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
  if (((await stat(evidenceDir)).mode & 0o077) !== 0) {
    evidenceDir = undefined;
    throw new Error("Invalid report directory permissions");
  }
  const bucket = required("SUPPORT_ATTACHMENTS_BUCKET");
  const region = required("AWS_REGION");
  const manifestFile = required("ATTACHMENT_RECONCILE_MANIFEST");
  const dbUrl = required("DATABASE_URL");
  required("ATTACHMENT_RECONCILE_SNS_TOPIC_ARN");

  const rows = (await readFile(manifestFile, "utf8")).trimEnd().split("\n");
  if (rows.shift() !== "attachment_id\tticket_id\tstorage_path\texpected_bytes\tobject_key\tsha256\tstatus") {
    throw new Error("Invalid cutover manifest header");
  }
  const baseline = new Map();
  for (const line of rows) {
    const [id, , , bytes, key, sha, status] = line.split("\t");
    if (!id || baseline.has(id) || !key?.startsWith(`${prefix}/`) ||
        !/^\d+$/.test(bytes) || !shaPattern.test(sha || "") || status !== "matched") {
      throw new Error("Cutover manifest contains incomplete or duplicate rows");
    }
    baseline.set(id, { key, bytes: Number(bytes), sha: sha.toLowerCase() });
  }
  if (process.env.ATTACHMENT_RECONCILE_ADDITIONS) {
    const additions = (await readFile(process.env.ATTACHMENT_RECONCILE_ADDITIONS, "utf8"))
      .trimEnd().split("\n");
    if (additions.shift() !== "attachment_id\tobject_key\texpected_bytes\tsha256") {
      throw new Error("Invalid additions header");
    }
    for (const line of additions) {
      const [id, key, bytes, sha, ...extra] = line.split("\t");
      if (extra.length || !id || baseline.has(id) || !key?.startsWith(`${prefix}/`) ||
          !/^\d+$/.test(bytes) || !shaPattern.test(sha || "")) {
        throw new Error("Invalid additions row");
      }
      baseline.set(id, { key, bytes: Number(bytes), sha: sha.toLowerCase() });
    }
  }

  const sql = `SELECT row_to_json(t) FROM (
    SELECT id, support_ticket_id, file_name, file_size, storage_path
    FROM support_ticket_attachments ORDER BY id
  ) t`;
  // PGDATABASE must be the database name, never the full URI; keep credentials
  // out of argv and reports while preserving supported libpq URI options.
  const stdout = execFileSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: connectionEnv(dbUrl) });
  const dbRows = stdout.trim() ? stdout.trimEnd().split("\n").map((line) => JSON.parse(line)) : [];
  const expectedKeys = new Set();
  const seenIds = new Set();
  for (const row of dbRows) {
    const base = baseline.get(row.id);
    // Once the S3 adapter stores keys, prefer the live key; legacy paths use the
    // deterministic cutover key, without reading the source file.
    const key = row.storage_path?.startsWith(`${prefix}/`)
      ? row.storage_path
      : `${prefix}/${row.support_ticket_id}/${row.id}/${row.file_name}`;
    if (seenIds.has(row.id) || expectedKeys.has(key) || !key.startsWith(`${prefix}/`) ||
        key.includes("..") || key.includes("\\") || !Number.isSafeInteger(row.file_size) || row.file_size < 0) {
      throw new Error("Invalid or duplicate attachment metadata");
    }
    seenIds.add(row.id);
    expectedKeys.add(key);
    report.checked++;
    if (!base || base.key !== key || base.bytes !== row.file_size) {
      problem("missing_or_changed_baseline", row.id, key);
    }
    let object;
    try {
      object = aws("s3api", "head-object", "--bucket", bucket, "--key", key,
        "--region", region, "--checksum-mode", "ENABLED");
    } catch {
      // A denied or broken HEAD is also an alert; no assumption that it is a 404.
      problem("missing_or_unreadable_object", row.id, key);
      continue;
    }
    if (object.ContentLength !== row.file_size) problem("size_mismatch", row.id, key);
    const digest = object.ChecksumSHA256;
    if (typeof digest !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(digest)) {
      problem("missing_sha256_metadata", row.id, key);
    } else if (base && Buffer.from(base.sha, "hex").toString("base64") !== digest) {
      problem("sha256_mismatch", row.id, key);
    }
  }
  for (const [id, base] of baseline) {
    if (!seenIds.has(id)) problem("missing_database_row", id, base.key);
  }

  let token;
  do {
    const args = ["s3api", "list-objects-v2", "--bucket", bucket, "--prefix", `${prefix}/`,
      "--max-keys", "1000", "--no-paginate", "--region", region];
    if (token) args.push("--continuation-token", token);
    const listing = aws(...args);
    for (const object of listing.Contents || []) {
      if (!expectedKeys.has(object.Key)) problem("unexpected_object", null, object.Key);
    }
    if (listing.IsTruncated && !listing.NextContinuationToken) throw new Error("Incomplete S3 listing");
    token = listing.IsTruncated ? listing.NextContinuationToken : undefined;
  } while (token);
  report.status = report.problems.length ? "drift" : "passed";
}

try {
  await main();
} catch (error) {
  report.status = "error";
  // Log a fixed diagnostic, never raw tool output, URLs, or credentials.
  problem("check_failed");
  const safe = error.message?.match(/^(Missing (?:DATABASE_URL|AWS_REGION|SUPPORT_ATTACHMENTS_BUCKET|ATTACHMENT_RECONCILE_[A-Z_]+)|Invalid (?:DATABASE_URL|cutover manifest header|attachment metadata|ATTACHMENT_RECONCILE_UNTIL|ATTACHMENT_RECONCILE_ENABLED|report directory permissions|additions header|additions row)|Unsupported DATABASE_URL option|Cutover manifest contains incomplete or duplicate rows|Incomplete S3 listing)$/);
  console.error(`Attachment reconciliation failed: ${safe ? safe[0] : "dependency or read error"}`);
  if (!evidenceDir && process.env.ATTACHMENT_RECONCILE_SNS_TOPIC_ARN && process.env.AWS_REGION) {
    try {
      alert(`Attachment reconciliation check failed at ${startedAt} before a restricted report could be saved. Investigate the scheduled job.`);
    } catch {
      console.error("Attachment reconciliation alert delivery failed");
    }
  }
}

if (evidenceDir) {
  report.finishedAt = new Date().toISOString();
  const file = join(evidenceDir, `attachment-reconciliation-${startedAt.replace(/[:.]/g, "-")}-${process.pid}.json`);
  try {
    await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    console.log(`Attachment reconciliation ${report.status}; report: ${file}`);
  } catch {
    report.status = "error";
    console.error("Could not retain reconciliation report");
  }
  if (report.status !== "passed" && report.status !== "disabled") {
    try {
      alert(`Attachment reconciliation ${report.status} at ${report.finishedAt}. ` +
        `Checked ${report.checked} database rows; problem counts: ${JSON.stringify(report.counts)}. ` +
        "Review the restricted reconciliation evidence and investigate before acceptance.");
    } catch {
      console.error("Attachment reconciliation alert delivery failed");
      report.status = "error";
    }
  }
}
if (report.status === "error" || report.status === "drift") process.exitCode = 1;