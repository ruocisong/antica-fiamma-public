#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const FRONTEND_ROOT = path.join(REPO_ROOT, "demo", "frontend");
const DEMO_URL = process.env.DEMO_URL || "http://127.0.0.1:8777/";

const REQUIRED_SCRIPT_PATHS = [
  "/static/modules/core/config.global.js",
  "/static/modules/core/state.global.js",
  "/static/modules/core/dom.global.js",
  "/static/modules/core/loaders.global.js",
  "/static/modules/core/routing.global.js",
  "/static/modules/panels/coverage_panel.global.js",
  "/static/modules/panels/authority_panel.global.js",
  "/static/modules/panels/semantic_panel.global.js",
  "/static/modules/panels/loci_panel.global.js",
  "/static/modules/panels/records_panel.global.js",
  "/static/modules/panels/search_bridge.global.js",
  "/static/app.js",
];

const REQUIRED_GLOBAL_MARKERS = [
  { file: "static/modules/panels/coverage_panel.global.js", marker: "global.DDPCoveragePanel" },
  { file: "static/modules/panels/authority_panel.global.js", marker: "global.DDPAuthorityPanel" },
  { file: "static/modules/panels/semantic_panel.global.js", marker: "global.DDPSemanticPanel" },
  { file: "static/modules/panels/loci_panel.global.js", marker: "global.DDPLociPanel" },
  { file: "static/modules/panels/records_panel.global.js", marker: "global.DDPRecordsPanel" },
  { file: "static/app.js", marker: "window.DDPAppShell = DDPAppShell" },
  { file: "static/app.js", marker: "window.DDPAppShellReady = init().then(() =>" },
];

function normalizeBaseUrl(url) {
  if (url.endsWith("/")) {
    return url;
  }
  return `${url}/`;
}

async function tryFetchText(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, mode: "http", status: response.status, error: `HTTP ${response.status}` };
    }
    return { ok: true, mode: "http", status: response.status, text: await response.text() };
  } catch (error) {
    return { ok: false, mode: "http", error: error.message || String(error) };
  }
}

async function readLocalText(relativePath) {
  const filePath = path.join(FRONTEND_ROOT, relativePath);
  return fs.readFile(filePath, "utf8");
}

function ensureIncludes(text, snippet, label) {
  if (!text.includes(snippet)) {
    throw new Error(`${label} missing expected snippet: ${snippet}`);
  }
}

function ensureScriptReference(text, scriptPath, label) {
  const escapedPath = scriptPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`src="${escapedPath}(?:\\?[^"]*)?"`);
  if (!pattern.test(text)) {
    throw new Error(`${label} missing expected script reference: ${scriptPath}`);
  }
}

async function fetchOrRead(relativePath, baseUrl) {
  const url = new URL(relativePath, baseUrl).toString();
  const fetched = await tryFetchText(url);
  if (fetched.ok) {
    return {
      source: "http",
      url,
      status: fetched.status,
      text: fetched.text,
    };
  }

  const text = await readLocalText(relativePath.replace(/^\.\//, ""));
  return {
    source: "filesystem-fallback",
    url,
    status: null,
    error: fetched.error,
    text,
  };
}

async function main() {
  const baseUrl = normalizeBaseUrl(DEMO_URL);
  const report = {
    checked_at: new Date().toISOString(),
    demo_url: baseUrl,
    shell_contract: "phase-d-panel-adapters",
    overall_ok: true,
    transport_mode: "unknown",
    checks: [],
    warnings: [],
  };

  const indexResult = await fetchOrRead("./index.html", baseUrl);
  report.transport_mode = indexResult.source;
  if (indexResult.source !== "http") {
    report.warnings.push(`HTTP fetch unavailable; used filesystem fallback for index.html (${indexResult.error || "unknown error"}).`);
  }

  try {
    ensureIncludes(indexResult.text, '<main class="workspace-grid">', "index.html");
    ensureIncludes(indexResult.text, 'id="coverage-section"', "index.html");
    ensureIncludes(indexResult.text, 'id="records-section"', "index.html");
    ensureIncludes(indexResult.text, 'id="compare-section"', "index.html");
    ensureIncludes(indexResult.text, 'id="scholar-section"', "index.html");
    for (const scriptPath of REQUIRED_SCRIPT_PATHS) {
      ensureScriptReference(indexResult.text, scriptPath, "index.html");
    }
    report.checks.push({ name: "index-shell-structure", ok: true, source: indexResult.source });
  } catch (error) {
    report.overall_ok = false;
    report.checks.push({ name: "index-shell-structure", ok: false, source: indexResult.source, error: error.message });
  }

  for (const item of REQUIRED_GLOBAL_MARKERS) {
    const asset = await fetchOrRead(`./${item.file}`, baseUrl);
    if (asset.source !== "http") {
      report.warnings.push(`Used filesystem fallback for ${item.file} (${asset.error || "unknown error"}).`);
    }
    try {
      ensureIncludes(asset.text, item.marker, item.file);
      report.checks.push({
        name: `asset:${item.file}`,
        ok: true,
        source: asset.source,
      });
    } catch (error) {
      report.overall_ok = false;
      report.checks.push({
        name: `asset:${item.file}`,
        ok: false,
        source: asset.source,
        error: error.message,
      });
    }
  }

  const manifest = await fetchOrRead("./data/manifest.json", baseUrl);
  try {
    const parsed = JSON.parse(manifest.text);
    if (!Array.isArray(parsed.samples) || parsed.samples.length !== 100) {
      throw new Error(`manifest sample count unexpected: ${parsed.samples?.length ?? "missing"}`);
    }
    report.checks.push({
      name: "manifest-100-samples",
      ok: true,
      source: manifest.source,
      sample_count: parsed.samples.length,
    });
  } catch (error) {
    report.overall_ok = false;
    report.checks.push({
      name: "manifest-100-samples",
      ok: false,
      source: manifest.source,
      error: error.message,
    });
  }

  const linePayload = await fetchOrRead("./data/inferno1/lines/001.json", baseUrl);
  try {
    const parsed = JSON.parse(linePayload.text);
    if (parsed.schema_version !== "line-payload/v2") {
      throw new Error(`unexpected line payload schema: ${parsed.schema_version}`);
    }
    if (!Array.isArray(parsed.record_ids) || !parsed.record_ids.length) {
      throw new Error("record_ids missing or empty");
    }
    if ("records" in parsed) {
      throw new Error("line payload still contains inline records");
    }
    report.checks.push({
      name: "line-payload-v2",
      ok: true,
      source: linePayload.source,
      record_id_count: parsed.record_ids.length,
    });
  } catch (error) {
    report.overall_ok = false;
    report.checks.push({
      name: "line-payload-v2",
      ok: false,
      source: linePayload.source,
      error: error.message,
    });
  }

  const recordStore = await fetchOrRead("./data/inferno1/records/store.json", baseUrl);
  try {
    const parsed = JSON.parse(recordStore.text);
    if (parsed.schema_version !== "sample-record-store/v1") {
      throw new Error(`unexpected record store schema: ${parsed.schema_version}`);
    }
    if (!parsed.records || typeof parsed.records !== "object") {
      throw new Error("record store records object missing");
    }
    report.checks.push({
      name: "sample-record-store-v1",
      ok: true,
      source: recordStore.source,
      record_count: parsed.record_count,
    });
  } catch (error) {
    report.overall_ok = false;
    report.checks.push({
      name: "sample-record-store-v1",
      ok: false,
      source: recordStore.source,
      error: error.message,
    });
  }

  const fulltextStore = await fetchOrRead("./data/inferno1/records/fulltext.json", baseUrl);
  try {
    const parsed = JSON.parse(fulltextStore.text);
    if (parsed.schema_version !== "sample-record-fulltext/v1") {
      throw new Error(`unexpected fulltext schema: ${parsed.schema_version}`);
    }
    if (!parsed.records || typeof parsed.records !== "object") {
      throw new Error("fulltext records object missing");
    }
    const firstKey = Object.keys(parsed.records)[0];
    if (!firstKey || typeof parsed.records[firstKey]?.record_text !== "string") {
      throw new Error("fulltext record_text missing");
    }
    report.checks.push({
      name: "sample-record-fulltext-v1",
      ok: true,
      source: fulltextStore.source,
      record_count: parsed.record_count,
    });
  } catch (error) {
    report.overall_ok = false;
    report.checks.push({
      name: "sample-record-fulltext-v1",
      ok: false,
      source: fulltextStore.source,
      error: error.message,
    });
  }

  const appScript = await fetchOrRead("./static/app.js", baseUrl);
  try {
    if (appScript.text.includes("/api/record")) {
      throw new Error("static app.js still references /api/record");
    }
    report.checks.push({
      name: "app-does-not-call-api-record",
      ok: true,
      source: appScript.source,
    });
  } catch (error) {
    report.overall_ok = false;
    report.checks.push({
      name: "app-does-not-call-api-record",
      ok: false,
      source: appScript.source,
      error: error.message,
    });
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.overall_ok ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`);
  process.exitCode = 1;
});
