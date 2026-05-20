#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const FRONTEND_DATA = path.join(REPO_ROOT, "demo", "frontend", "data");
const REPORT_PATH = path.join(
  REPO_ROOT,
  "demo",
  "frontend",
  "reports",
  "authority_canto_index_smoke.json",
);

const DANTE_COMMEDIA_WORKS = new Set([
  "inferno",
  "purgatorio",
  "paradiso",
  "commedia",
]);

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function pushFailure(failures, sample, message, extra = {}) {
  failures.push({ sample, message, ...extra });
}

function validateAuthorRows(sampleId, payload, failures) {
  const authors = Array.isArray(payload.authors) ? payload.authors : [];
  const seenAuthors = new Set();
  let totalSignals = 0;
  let computedMaxLineSignalCount = 0;

  for (const author of authors) {
    const authorId = String(author?.author_id || "").trim();
    if (!authorId) {
      pushFailure(failures, sampleId, "author row missing author_id");
      continue;
    }
    if (seenAuthors.has(authorId)) {
      pushFailure(failures, sampleId, "duplicate author row", { author_id: authorId });
    }
    seenAuthors.add(authorId);

    const recordCount = asNumber(author.record_count);
    const records = Array.isArray(author.records) ? author.records : [];
    const recordIds = new Set(records.map((record) => String(record?.id || "").trim()).filter(Boolean));
    if (recordCount !== recordIds.size) {
      pushFailure(failures, sampleId, "author record_count does not match unique records", {
        author_id: authorId,
        record_count: recordCount,
        unique_records: recordIds.size,
      });
    }

    const stable = asNumber(author.stable_signal_count);
    const caveated = asNumber(author.caveated_signal_count);
    const signalCount = asNumber(author.signal_count);
    totalSignals += signalCount;
    if (signalCount !== stable + caveated) {
      pushFailure(failures, sampleId, "author signal_count does not equal stable+caveated", {
        author_id: authorId,
        signal_count: signalCount,
        stable_signal_count: stable,
        caveated_signal_count: caveated,
      });
    }

    for (const line of Array.isArray(author.lines) ? author.lines : []) {
      const lineNumber = asNumber(line.line_number);
      const lineSignals = asNumber(line.signal_count);
      if (lineNumber < 1 || lineNumber > asNumber(payload.line_count)) {
        pushFailure(failures, sampleId, "author line out of canto bounds", {
          author_id: authorId,
          line_number: lineNumber,
          line_count: payload.line_count,
        });
      }
      computedMaxLineSignalCount = Math.max(computedMaxLineSignalCount, lineSignals);
    }

    for (const work of Array.isArray(author.works) ? author.works : []) {
      const canonicalWork = String(work?.canonical_work || "").trim().toLowerCase();
      if (authorId.toLowerCase() === "dante" && DANTE_COMMEDIA_WORKS.has(canonicalWork)) {
        pushFailure(failures, sampleId, "Dante Commedia self-work leaked into canto authority index", {
          author_id: authorId,
          canonical_work: work?.canonical_work,
        });
      }
    }
  }

  if (asNumber(payload.authority_count) !== authors.length) {
    pushFailure(failures, sampleId, "authority_count does not match authors length", {
      authority_count: payload.authority_count,
      authors_length: authors.length,
    });
  }
  if (asNumber(payload.max_line_signal_count) !== computedMaxLineSignalCount) {
    pushFailure(failures, sampleId, "max_line_signal_count does not match computed max", {
      max_line_signal_count: payload.max_line_signal_count,
      computed_max_line_signal_count: computedMaxLineSignalCount,
    });
  }

  return { totalSignals, computedMaxLineSignalCount };
}

async function validateSample(sample) {
  const sampleId = String(sample.id || "").trim();
  const recordsDir = path.join(FRONTEND_DATA, sampleId, "records");
  const indexPath = path.join(recordsDir, "authority_canto_index.json");
  const storePath = path.join(recordsDir, "store.json");
  const payload = await readJson(indexPath);
  const store = await readJson(storePath);
  const failures = [];

  if (payload.schema_version !== "sample-authority-canto-index/v1") {
    pushFailure(failures, sampleId, "unexpected schema_version", { schema_version: payload.schema_version });
  }
  if (payload.sample !== sampleId) {
    pushFailure(failures, sampleId, "payload sample id mismatch", { payload_sample: payload.sample });
  }

  const storeRecords = store.records && typeof store.records === "object" ? store.records : {};
  const storeRecordCount = Object.keys(storeRecords).length;
  if (asNumber(payload.record_count) !== storeRecordCount) {
    pushFailure(failures, sampleId, "record_count does not match store records", {
      payload_record_count: payload.record_count,
      store_record_count: storeRecordCount,
    });
  }

  const authorityRecordIds = new Set();
  for (const author of Array.isArray(payload.authors) ? payload.authors : []) {
    for (const record of Array.isArray(author.records) ? author.records : []) {
      const recordId = String(record?.id || "").trim();
      if (recordId) {
        authorityRecordIds.add(recordId);
        if (!storeRecords[recordId]) {
          pushFailure(failures, sampleId, "authority record missing from store", {
            author_id: author.author_id,
            record_id: recordId,
          });
        }
      }
    }
  }
  if (asNumber(payload.authority_record_count) !== authorityRecordIds.size) {
    pushFailure(failures, sampleId, "authority_record_count does not match unique author records", {
      authority_record_count: payload.authority_record_count,
      unique_authority_records: authorityRecordIds.size,
    });
  }

  const authorStats = validateAuthorRows(sampleId, payload, failures);
  return {
    sample: sampleId,
    ok: failures.length === 0,
    record_count: asNumber(payload.record_count),
    authority_record_count: asNumber(payload.authority_record_count),
    authority_count: asNumber(payload.authority_count),
    max_line_signal_count: asNumber(payload.max_line_signal_count),
    total_signal_count: authorStats.totalSignals,
    bytes: (await fs.stat(indexPath)).size,
    failures,
  };
}

async function main() {
  const manifest = await readJson(path.join(FRONTEND_DATA, "manifest.json"));
  const samples = (manifest.samples || []).filter((sample) => sample?.record_store_available);
  const rows = [];
  const failures = [];

  for (const sample of samples) {
    try {
      const row = await validateSample(sample);
      rows.push(row);
      failures.push(...row.failures);
    } catch (error) {
      const sampleId = String(sample?.id || "unknown");
      const failure = { sample: sampleId, message: error.message || String(error) };
      rows.push({ sample: sampleId, ok: false, failures: [failure] });
      failures.push(failure);
    }
  }

  const report = {
    schema_version: "authority-canto-index-smoke/v1",
    checked_at: new Date().toISOString(),
    overall_ok: failures.length === 0 && rows.length === 100,
    sample_count: rows.length,
    expected_sample_count: 100,
    total_authority_records: rows.reduce((sum, row) => sum + asNumber(row.authority_record_count), 0),
    total_bytes: rows.reduce((sum, row) => sum + asNumber(row.bytes), 0),
    min_authority_records: Math.min(...rows.map((row) => asNumber(row.authority_record_count))),
    max_authority_records: Math.max(...rows.map((row) => asNumber(row.authority_record_count))),
    failures,
    rows,
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    overall_ok: report.overall_ok,
    sample_count: report.sample_count,
    total_authority_records: report.total_authority_records,
    total_bytes: report.total_bytes,
    failure_count: failures.length,
    report: path.relative(REPO_ROOT, REPORT_PATH),
  }, null, 2));

  if (!report.overall_ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
