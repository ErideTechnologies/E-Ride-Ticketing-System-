import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const script = resolve("scripts/migration/reconcile-attachments.mjs");
const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ticket = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const key = `support-attachments/${ticket}/${id}/file.pdf`;
const sha = "a".repeat(64);
const checksum = Buffer.from(sha, "hex").toString("base64");

async function fixture({ dbRows, objects, head, additions } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "attachment-reconcile-"));
  const bin = join(dir, "bin");
  const reports = join(dir, "reports");
  await mkdir(bin);
  await writeFile(join(dir, "manifest.tsv"),
    `attachment_id\tticket_id\tstorage_path\texpected_bytes\tobject_key\tsha256\tstatus\n${id}\t${ticket}\told/file.pdf\t4\t${key}\t${sha}\tmatched\n`);
  if (additions) await writeFile(join(dir, "additions.tsv"), additions);
  await writeFile(join(dir, "data.json"), JSON.stringify({
    dbRows: dbRows ?? [{ id, support_ticket_id: ticket, file_name: "file.pdf", file_size: 4, storage_path: "old/file.pdf" }],
    objects: objects ?? [key],
    head: head === undefined ? { ContentLength: 4, ChecksumSHA256: checksum } : head,
  }));
  const mock = `#!/usr/bin/env node
const {readFileSync,appendFileSync}=require("node:fs");
const d=JSON.parse(readFileSync(process.env.MOCK_DATA,"utf8"));
const args=process.argv.slice(2);
if(process.argv[1].endsWith("/psql")) {
  if(args.includes("-d") || args.some(a=>a.includes("fixture-password")) ||
      process.env.PGDATABASE!=="db" || process.env.PGHOST!=="example.invalid" ||
      process.env.PGUSER!=="example" || process.env.PGPASSWORD!=="fixture-password" ||
      process.env.PGSSLMODE!=="require") process.exit(2);
  process.stdout.write(d.dbRows.map(r=>JSON.stringify(r)).join("\\n")+"\\n");
}
else if(args[0]==="sns") { appendFileSync(process.env.MOCK_ALERT,"alert\\n"); process.stdout.write("{}"); }
else if(args[1]==="head-object") { if(!d.head) process.exit(1); process.stdout.write(JSON.stringify(d.head)); }
else if(args[1]==="list-objects-v2") {
  const start=args.includes("--continuation-token") ? 1 : 0;
  process.stdout.write(JSON.stringify({Contents:(d.objects[start] ? [{Key:d.objects[start]}] : []),
    IsTruncated:start===0 && d.objects.length>1,
    NextContinuationToken:start===0 && d.objects.length>1 ? "page2" : undefined}));
} else process.exit(1);
`;
  for (const name of ["aws", "psql"]) {
    await writeFile(join(bin, name), mock);
    await chmod(join(bin, name), 0o700);
  }
  return {
    dir, reports,
    env: {
      ...process.env, PATH: `${bin}:${process.env.PATH}`, MOCK_DATA: join(dir, "data.json"),
      MOCK_ALERT: join(dir, "alerts"),
      DATABASE_URL: "postgres://example:fixture-password@example.invalid:5432/db?sslmode=require",
      SUPPORT_ATTACHMENTS_BUCKET: "private-bucket", AWS_REGION: "us-east-1",
      ATTACHMENT_RECONCILE_MANIFEST: join(dir, "manifest.tsv"),
      ATTACHMENT_RECONCILE_REPORT_DIR: reports,
      ATTACHMENT_RECONCILE_SNS_TOPIC_ARN: "arn:aws:sns:us-east-1:000000000000:alerts",
      ATTACHMENT_RECONCILE_ENABLED: "true", ATTACHMENT_RECONCILE_UNTIL: "2099-01-01T00:00:00Z",
      ...(additions ? { ATTACHMENT_RECONCILE_ADDITIONS: join(dir, "additions.tsv") } : {}),
    },
  };
}

async function check(f, overrides = {}) {
  const run = spawnSync(process.execPath, [script], { env: { ...f.env, ...overrides }, encoding: "utf8" });
  const files = await readdir(f.reports).catch(() => []);
  const report = files.length ? JSON.parse(await readFile(join(f.reports, files[0]), "utf8")) : null;
  const alerts = await readFile(join(f.dir, "alerts"), "utf8").catch(() => "");
  return { run, report, alerts };
}

test("reconciles a private object without alerting; expired schedule stops", async () => {
  const f = await fixture();
  const result = await check(f);
  assert.equal(result.run.status, 0);
  assert.equal(result.report.status, "passed");
  assert.equal(result.report.checked, 1);
  assert.equal(result.alerts, "");
  assert.doesNotMatch(JSON.stringify(result.report) + result.run.stdout, /fixture-password/);
  const disabled = await check(await fixture(), { ATTACHMENT_RECONCILE_UNTIL: "2020-01-01T00:00:00Z" });
  assert.equal(disabled.run.status, 0);
  assert.equal(disabled.report, null);
  const switchedOff = await check(await fixture(), { ATTACHMENT_RECONCILE_ENABLED: "false" });
  assert.equal(switchedOff.run.status, 0);
  assert.equal(switchedOff.report, null);
});

test("alerts on missing, mismatched and unexpected objects, including listing pagination", async () => {
  const f = await fixture({ head: { ContentLength: 3, ChecksumSHA256: Buffer.alloc(32).toString("base64") },
    objects: [key, "support-attachments/orphan"] });
  const result = await check(f);
  assert.equal(result.run.status, 1);
  assert.deepEqual(result.report.counts, { size_mismatch: 1, sha256_mismatch: 1, unexpected_object: 1 });
  assert.equal(result.alerts, "alert\n");
  assert.doesNotMatch(JSON.stringify(result.report), /postgres:\/\//);
  const missing = await check(await fixture({ head: null }));
  assert.equal(missing.report.counts.missing_or_unreadable_object, 1);
  assert.equal(missing.run.status, 1);
  const noSha = await check(await fixture({ head: { ContentLength: 4 } }));
  assert.equal(noSha.report.counts.missing_sha256_metadata, 1);
});

test("new rows need an independently recorded checksum baseline", async () => {
  const extraId = "cccccccc-cccc-cccc-cccc-cccccccccccc";
  const extraKey = `support-attachments/${ticket}/${extraId}/file.pdf`;
  const rows = [
    { id, support_ticket_id: ticket, file_name: "file.pdf", file_size: 4, storage_path: "old/file.pdf" },
    { id: extraId, support_ticket_id: ticket, file_name: "file.pdf", file_size: 4, storage_path: extraKey },
  ];
  const noBaseline = await check(await fixture({ dbRows: rows, objects: [key, extraKey] }));
  assert.equal(noBaseline.report.counts.missing_or_changed_baseline, 1);
  const additions = `attachment_id\tobject_key\texpected_bytes\tsha256\n${extraId}\t${extraKey}\t4\t${sha}\n`;
  const approved = await check(await fixture({ dbRows: rows, objects: [key, extraKey], additions }));
  assert.equal(approved.report.status, "passed");
});