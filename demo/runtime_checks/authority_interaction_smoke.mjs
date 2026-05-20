#!/usr/bin/env node

import http from "node:http";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEBUG_HOST = process.env.CDP_HOST || "127.0.0.1";
const DEMO_URL = process.env.DEMO_URL || "http://127.0.0.1:8777/";
const DEBUG_PORTS = (() => {
  const explicitPorts = String(process.env.CDP_PORTS || "").trim();
  if (explicitPorts) {
    return explicitPorts
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  const primaryPort = String(process.env.CDP_PORT || "9333").trim() || "9333";
  return [...new Set([primaryPort, "9222"].filter(Boolean))];
})();
const SMOKE_ONLY = String(process.env.AUTHORITY_SMOKE_ONLY || "")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const SMOKE_TRACE = /^(1|true|yes)$/i.test(String(process.env.AUTHORITY_SMOKE_TRACE || "").trim());
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_JSON_PATH = path.resolve(__dirname, "../frontend/reports/authority_interaction_smoke.json");
const REPORT_MD_PATH = path.resolve(__dirname, "../frontend/reports/authority_review_packet.md");

function normalizeComparableUrl(rawUrl, { ignoreSearch = false } = {}) {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    const normalizedPath = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
    return `${url.origin}${normalizedPath}${ignoreSearch ? "" : url.search}`;
  } catch (_error) {
    return String(rawUrl || "").replace(/\/+$/, "");
  }
}

function isDemoTarget(targetUrl) {
  return normalizeComparableUrl(targetUrl, { ignoreSearch: true }) === normalizeComparableUrl(DEMO_URL, { ignoreSearch: true });
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJsonViaHttp(url) {
  return await new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      if ((response.statusCode || 500) >= 400) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode}: ${url}`));
        return;
      }

      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (!body.trim()) {
          reject(new Error(`Empty HTTP response: ${url}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on("error", reject);
    request.setTimeout(1500, () => {
      request.destroy(new Error(`HTTP timeout: ${url}`));
    });
  });
}

async function fetchJson(url, attempts = 20, delayMs = 250) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Fetch failed ${response.status}: ${url}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      try {
        return await fetchJsonViaHttp(url);
      } catch (httpError) {
        lastError = httpError;
      }
      await sleep(delayMs);
    }
  }
  throw lastError || new Error(`Fetch failed: ${url}`);
}

async function connectDebugger(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  const events = [];

  ws.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.id) {
      const resolver = pending.get(payload.id);
      if (!resolver) {
        return;
      }
      pending.delete(payload.id);
      if (payload.error) {
        resolver.reject(new Error(payload.error.message || "CDP command failed"));
      } else {
        resolver.resolve(payload.result);
      }
      return;
    }
    events.push(payload);
  });

  function send(method, params = {}) {
    const commandId = ++id;
    ws.send(JSON.stringify({ id: commandId, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(commandId, { resolve, reject });
    });
  }

  return { ws, send, events };
}

async function resolveDebuggerEndpoint() {
  let lastError = null;

  for (const port of DEBUG_PORTS) {
    try {
      const versionUrl = `http://${DEBUG_HOST}:${port}/json/version`;
      const listUrl = `http://${DEBUG_HOST}:${port}/json/list`;

      let version = null;
      try {
        version = await fetchJson(versionUrl, 2, 100);
      } catch (error) {
        lastError = error;
      }

      const targets = await fetchJson(listUrl, 2, 100);
      if (Array.isArray(targets) && targets.length) {
        return { port, version, targets };
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Could not reach any Chrome debugger endpoint.");
}

async function ensureDemoPageTarget() {
  const endpoint = await resolveDebuggerEndpoint();
  const { port, version } = endpoint;
  let targets = endpoint.targets;
  let pageTarget = targets.find((target) =>
    target.type === "page" && isDemoTarget(target.url)
  );

  if (pageTarget?.webSocketDebuggerUrl) {
    return pageTarget;
  }

  if (!version?.webSocketDebuggerUrl) {
    pageTarget = targets.find((target) => target.type === "page");
    if (pageTarget?.webSocketDebuggerUrl) {
      return pageTarget;
    }
    throw new Error("Could not find browser websocket endpoint.");
  }

  const browser = await connectDebugger(version.webSocketDebuggerUrl);
  try {
    const created = await browser.send("Target.createTarget", { url: DEMO_URL });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await sleep(250);
      targets = await fetchJson(`http://${DEBUG_HOST}:${port}/json/list`);
      pageTarget = targets.find((target) =>
        target.type === "page"
          && (target.id === created.targetId || isDemoTarget(target.url))
      );
      if (pageTarget?.webSocketDebuggerUrl) {
        return pageTarget;
      }
    }
  } finally {
    browser.ws.close();
  }

  pageTarget = targets.find((target) => target.type === "page");
  if (pageTarget?.webSocketDebuggerUrl) {
    return pageTarget;
  }

  throw new Error("Could not find page target for demo frontend.");
}

async function connectToChrome() {
  const pageTarget = await ensureDemoPageTarget();
  return connectDebugger(pageTarget.webSocketDebuggerUrl);
}

function formatValue(value) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

function trace(message) {
  if (SMOKE_TRACE) {
    console.error(`[trace] ${message}`);
  }
}

function writeSmokeArtifacts(payload) {
  const authorsDetail = payload?.results?.find((item) => item.name === "all authority authors basic install")?.detail || {};
  const authorCount = Number(authorsDetail.authorCount || 0);
  const visited = Array.isArray(authorsDetail.visited) ? authorsDetail.visited : [];
  payload.authorCount = authorCount;
  payload.visited = visited.length;
  writeFileSync(REPORT_JSON_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  const worksTreeCount = visited.filter((row) => row.worksLayerMode === "works_tree").length;
  const flatCount = visited.filter((row) => row.worksLayerMode === "flat_work_overview").length;
  const specialCount = visited.filter((row) => row.worksLayerMode === "no_works_tree").length;
  const specialEntryCount = visited.filter((row) => row.entryContractType === "special_case_entry").length;
  const lines = [
    "# Authority Review Packet",
    "",
    `- ok: ${payload.ok}`,
    `- resultCount: ${payload.resultCount}`,
    `- authorCount: ${authorCount}`,
    `- failures: ${Array.isArray(payload.failures) ? payload.failures.length : 0}`,
    `- works-tree entries visited: ${worksTreeCount}`,
    `- flat-overview entries visited: ${flatCount}`,
    `- special-case entries visited: ${specialCount}`,
    `- special-case entry contracts visited: ${specialEntryCount}`,
    "",
    "## Notes",
    "",
    "- This packet is generated from the current live workbench smoke.",
    "- It reflects the active authority universe rather than older 45-author snapshots.",
  ];
  if (Array.isArray(payload.failures) && payload.failures.length) {
    lines.push("", "## Failures", "");
    for (const failure of payload.failures) {
      lines.push(`- ${failure.name}: ${failure.error}`);
    }
  }
  writeFileSync(REPORT_MD_PATH, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const { ws, send } = await connectToChrome();
  const authorityLayer = await fetchJson(new URL("data/authority_layer.json", DEMO_URL).toString());
  const authorityAuthorLookup = new Map();
  for (const author of Array.isArray(authorityLayer?.authors) ? authorityLayer.authors : []) {
    if (author?.author_id) {
      authorityAuthorLookup.set(String(author.author_id), author);
    }
    if (author?.public_slug_it) {
      authorityAuthorLookup.set(String(author.public_slug_it), author);
    }
  }
  const failures = [];
  const results = [];

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    return result.result?.value;
  }

  async function waitFor(checkExpression, timeoutMs = 10000) {
    const start = Date.now();
    while ((Date.now() - start) < timeoutMs) {
      const ok = await evaluate(checkExpression);
      if (ok) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    return false;
  }

  async function click(selector) {
    return evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return false;
      node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    })()`);
  }

  async function openAuthorityView(viewId, timeoutMs = 12000) {
    const settle = async () => {
      if (viewId === "drilldown") {
        return waitFor(`(() => {
          const active = document.querySelector('[data-authority-view].is-active');
          if (active && active.getAttribute('data-authority-view') === "drilldown") {
            return true;
          }
          const heading = [...document.querySelectorAll('.authority-stage-block h4')]
            .map((node) => node.textContent || '')
            .find((text) => text.includes('Work Layer'));
          return Boolean(
            heading
            || document.querySelector('.authority-stage-block-secondary [data-authority-occurrence-key]')
            || document.querySelector('.authority-flat-banner')
            || document.querySelector('.authority-caveat-banner')
            || document.querySelector('.authority-scope-shell')
            || document.querySelector('[data-authority-work]')
            || document.querySelector('[data-authority-node]')
            || document.querySelector('[data-authority-occurrence-key]')
          );
        })()`, Math.max(timeoutMs, 20000));
      }
      return waitFor(`(() => {
        const active = document.querySelector('[data-authority-view].is-active');
        return active && active.getAttribute('data-authority-view') === ${JSON.stringify(viewId)};
      })()`, timeoutMs);
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await waitFor(`Boolean(document.querySelector(${JSON.stringify(`[data-authority-view="${viewId}"]`)}))`, 5000);
      const clicked = await click(`[data-authority-view="${viewId}"]`);
      if (clicked) {
        const settled = await settle();
        if (settled) {
          return true;
        }
        if (SMOKE_TRACE) {
          const snapshot = await evaluate(`(() => ({
            activeView: document.querySelector('[data-authority-view].is-active')?.getAttribute('data-authority-view') || null,
            flatBanner: Boolean(document.querySelector('.authority-flat-banner')),
            caveatBanner: Boolean(document.querySelector('.authority-caveat-banner')),
            specialCasePanel: Boolean(document.querySelector('.authority-special-case-panel')),
            workButtonCount: document.querySelectorAll('[data-authority-work]').length,
            nodeCount: document.querySelectorAll('[data-authority-node]').length,
            occurrenceCount: document.querySelectorAll('[data-authority-occurrence-key]').length,
            stageHeading: [...document.querySelectorAll('.authority-stage-block h4')].map((node) => node.textContent?.trim()).filter(Boolean).slice(0, 4),
            figureText: (document.querySelector('#figure-panel')?.textContent || '').trim().slice(0, 400),
          }))()`);
          trace(`openAuthorityView(${viewId}) attempt ${attempt + 1} snapshot ${formatValue(snapshot)}`);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return viewId === "drilldown";
  }

  async function readText(selector) {
    return evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return null;
      const raw = typeof node.innerText === 'string' && node.innerText.trim()
        ? node.innerText
        : node.textContent;
      return String(raw || '').replace(/\\s*\\n\\s*/g, '\\n').replace(/[ \\t]+/g, ' ').trim() || null;
    })()`);
  }

  async function waitForAuthorityPrimarySurface(timeoutMs = 12000) {
    return waitFor(`(() => {
      return Boolean(
        document.querySelector('.authority-reading-contract')
        || document.querySelector('.authority-flat-banner')
        || document.querySelector('.authority-caveat-banner')
        || document.querySelector('.authority-special-case-panel')
        || document.querySelector('[data-authority-work]')
        || document.querySelector('[data-authority-node]')
        || document.querySelector('[data-authority-occurrence-key]')
        || document.querySelector('.authority-stage-block .empty-state')
        || document.querySelector('.vocabulary-section-grid .empty-state')
      );
    })()`, timeoutMs);
  }

  async function test(name, fn) {
    if (SMOKE_ONLY.length) {
      const lowered = String(name || "").toLowerCase();
      const shouldRun = SMOKE_ONLY.some((token) => lowered.includes(token));
      if (!shouldRun) {
        return;
      }
    }
    console.error(`[smoke] start: ${name}`);
    try {
      const detail = await fn();
      results.push({ name, ok: true, detail });
      console.error(`[smoke] ok: ${name}`);
    } catch (error) {
      failures.push({ name, error: error.message || String(error) });
      results.push({ name, ok: false, detail: error.message || String(error) });
      console.error(`[smoke] fail: ${name} :: ${error.message || String(error)}`);
    }
  }

  async function selectAuthorityAuthor(authorId, expectedName) {
    await evaluate(`(() => {
      const shelf = document.querySelector('.authority-secondary-shelf');
      if (shelf && !shelf.open) {
        shelf.open = true;
      }
      return true;
    })()`);
    if (!(await click(`[data-authority-id="${authorId}"]`))) {
      throw new Error(`${expectedName || authorId} author chip not found.`);
    }
    const ready = await waitFor(`(() => {
      const chip = document.querySelector(${JSON.stringify(`[data-authority-id="${authorId}"]`)});
      const summary = document.querySelector('.figure-summary strong')?.textContent?.trim() || '';
      const expected = ${JSON.stringify(String(authorId || "").trim().toLowerCase())};
      const chipText = chip?.textContent?.trim()?.toLowerCase() || '';
      const summaryLower = summary.toLowerCase();
      const chipHead = chipText.split(/\\s+/)[0] || '';
      const summaryMatchesChip = !chipHead || summaryLower.includes(chipHead);
      return Boolean(chip?.classList?.contains('is-active'))
        && Boolean(summary)
        && chip?.getAttribute('data-authority-id') === expected
        && summaryMatchesChip
        && Boolean(document.querySelector('[data-authority-view="text"]'))
        && Boolean(document.querySelector('[data-authority-view="drilldown"]'));
    })()`, 8000);
    if (!ready) {
      throw new Error(`${expectedName || authorId} author summary did not activate.`);
    }
    await waitFor(`Boolean(document.querySelector('[data-authority-view="text"].is-active'))`, 8000);
  }

  await send("Page.enable");
  await send("Runtime.enable");
  async function reopenAuthorityLens() {
    await send("Page.navigate", { url: DEMO_URL });
    await waitFor(`document.readyState === "complete"`, 15000);
    const loaded = await waitFor(`Boolean(document.querySelector("#figure-panel")) && Boolean(document.querySelector('[data-lens-tab="authority"]'))`, 30000);
    if (!loaded) {
      throw new Error("Page did not finish initializing authority shell.");
    }
    const clicked = await click('[data-lens-tab="authority"]');
    if (!clicked) {
      throw new Error("Authority lens tab not found.");
    }
    const ready = await waitFor(`Boolean(document.querySelector('[data-authority-id]')) && Boolean(document.querySelector('.figure-summary strong'))`, 15000);
    if (!ready) {
      throw new Error("Authority lens did not render.");
    }
    const viewsReady = await waitFor(`Boolean(document.querySelector('[data-authority-view="text"]')) && Boolean(document.querySelector('[data-authority-view="drilldown"]'))`, 15000);
    if (!viewsReady) {
      throw new Error("Authority lens view controls did not render.");
    }
  }

  await reopenAuthorityLens();

  await test("switch to authority lens", async () => {
    await reopenAuthorityLens();
    return await readText(".figure-summary strong");
  });

  await test("all authority authors basic install", async () => {
    const authors = await evaluate(`(() => {
      return [...document.querySelectorAll('[data-authority-id]')].map((button) => ({
        id: button.getAttribute('data-authority-id'),
        label: button.querySelector('strong')?.textContent?.trim() || button.textContent.trim(),
      }));
    })()`);
    if (!Array.isArray(authors) || authors.length < 12) {
      throw new Error(`Expected at least 12 authority chips, got ${authors?.length || 0}.`);
    }

    const visited = [];
    for (const author of authors) {
      console.error(`[smoke] author: ${author.id}`);
      await selectAuthorityAuthor(author.id, author.label);
      const liveAuthor = authorityAuthorLookup.get(author.id) || null;
      const summary = await readText(".figure-summary strong");
      if (!summary || !summary.toLowerCase().includes(String(author.label).toLowerCase().split(" ")[0])) {
        throw new Error(`Summary did not settle for ${author.id}.`);
      }

      const canOpenDrilldown = await openAuthorityView("drilldown");
      if (canOpenDrilldown) {
        const ready = await waitForAuthorityPrimarySurface(12000);
        if (!ready) {
          throw new Error(`Primary drilldown surface did not render for ${author.id}.`);
        }
      }

      visited.push({
        id: author.id,
        label: author.label,
        summary,
        worksLayerMode: liveAuthor?.works_layer_mode || null,
        entryMode: liveAuthor?.entry_mode || null,
        entryContractType: liveAuthor?.reading_contract_meta?.entry_contract_type || null,
        contract: await readText(".authority-reading-contract"),
        banner: await readText(".authority-flat-banner"),
        specialCase: await readText(".authority-special-case-panel"),
        workCount: await evaluate(`document.querySelectorAll('[data-authority-work]').length`),
      });
    }

    return {
      authorCount: authors.length,
      visited,
    };
  });

  await test("cicero works tree navigation", async () => {
    trace("cicero: reopen lens");
    await reopenAuthorityLens();
    trace("cicero: select author");
    await selectAuthorityAuthor("cicero", "Cicero");
    trace("cicero: open drilldown");
    if (!(await openAuthorityView("drilldown"))) {
      throw new Error("Cicero drilldown tab not found.");
    }
    trace("cicero: wait work buttons");
    const workReady = await waitFor(`document.querySelectorAll('[data-authority-work]').length > 1`, 8000);
    if (!workReady) {
      const snapshot = await evaluate(`(() => ({
        activeView: document.querySelector('[data-authority-view].is-active')?.getAttribute('data-authority-view') || null,
        workButtonCount: document.querySelectorAll('[data-authority-work]').length,
        flatBanner: document.querySelector('.authority-flat-banner')?.textContent?.trim() || null,
        emptyStates: [...document.querySelectorAll('.empty-state')].map((node) => node.textContent?.trim()).filter(Boolean).slice(0, 5),
        stageHeading: [...document.querySelectorAll('.authority-stage-block h4')].map((node) => node.textContent?.trim()).filter(Boolean).slice(0, 5),
        flatLoadDebug: window.__authorityFlatLoadDebug || null,
        genericDrilldownDebug: window.__authorityGenericDrilldownDebug || null,
      }))()`);
      trace(`cicero: missing work buttons snapshot ${formatValue(snapshot)}`);
      throw new Error("Cicero work filter did not render.");
    }
    const contractText = await readText(".authority-reading-contract");
    if (!contractText || !contractText.includes("Works-tree entry")) {
      throw new Error("Cicero works-tree contract missing.");
    }
    trace("cicero: pick work");
    const pickedWork = await evaluate(`(() => {
      const buttons = [...document.querySelectorAll('[data-authority-work]')];
      const candidate = buttons.find((button) => {
        const value = button.getAttribute('data-authority-work');
        return value && value !== '__all__' && value !== '__unresolved__';
      });
      if (!candidate) return null;
      const value = candidate.getAttribute('data-authority-work');
      candidate.click();
      return value;
    })()`);
    if (!pickedWork) {
      throw new Error("Cicero did not expose a clickable work filter.");
    }
    trace(`cicero: picked work ${pickedWork}`);
    const workSurfaceReady = await waitFor(`document.querySelectorAll('[data-authority-occurrence-key]').length > 0 || document.querySelectorAll('[data-authority-node]').length > 0`, 8000);
    if (!workSurfaceReady) {
      throw new Error("Cicero work tree did not expose a node or occurrence surface.");
    }
    await evaluate(`(() => {
      const preferred = document.querySelector('[data-authority-node="work_only"]');
      if (preferred) {
        preferred.click();
        return 'work_only';
      }
      const candidate = document.querySelector('[data-authority-node]');
      if (candidate) {
        candidate.click();
        return candidate.getAttribute('data-authority-node') || 'node';
      }
      return null;
    })()`);
    const rowReady = await waitFor(`document.querySelectorAll('[data-authority-occurrence-key]').length > 0`, 8000);
    if (!rowReady) {
      throw new Error("Cicero occurrence rows did not render.");
    }
    trace("cicero: click occurrence");
    await click('[data-authority-occurrence-key]');
    const sourceReady = await waitFor(`Boolean(document.querySelector('.authority-source-panel .authority-source-head h5'))`, 8000);
    if (!sourceReady) {
      throw new Error("Cicero source panel did not render.");
    }
    trace("cicero: source panel ready");
    return {
      selectedAuthor: await readText(".figure-summary strong"),
      pickedWork,
      contractText,
      selectedHeading: await readText(".authority-stage-block-secondary h4"),
      sourceHeading: await readText(".authority-source-head h5"),
    };
  });

  await test("statius special-case shell", async () => {
    await reopenAuthorityLens();
    await selectAuthorityAuthor("statius", "Statius");
    if (!(await openAuthorityView("commentary"))) {
      throw new Error("Statius commentary tab not found.");
    }
    const panelReady = await waitFor(`Boolean(document.querySelector('.authority-special-case-panel'))`, 8000);
    if (!panelReady) {
      throw new Error("Statius special-case panel missing.");
    }
    const panelText = await readText(".authority-special-case-panel");
    if (!panelText || !panelText.includes("Purgatorio 21+")) {
      throw new Error("Statius special-case scope missing Purgatorio 21+.");
    }
    await openAuthorityView("drilldown");
    const worksReady = await waitFor(`Boolean(document.querySelector('[data-authority-work="Thebaid"]'))`, 8000);
    if (!worksReady) {
      throw new Error("Statius works tree did not render.");
    }
    const drilldownPanelText = await readText(".authority-special-case-panel");
    if (!drilldownPanelText || !drilldownPanelText.includes("Purgatorio 21+")) {
      throw new Error("Statius works lens lost the Purgatorio 21+ special-case panel.");
    }
    return {
      specialCasePanel: panelText,
      drilldownPanel: drilldownPanelText,
      contractText: await readText(".authority-reading-contract"),
      workButtons: await evaluate(`document.querySelectorAll('[data-authority-work]').length`),
    };
  });

  await test("virgil special-case backbones", async () => {
    await reopenAuthorityLens();
    await selectAuthorityAuthor("virgil", "Virgil");
    if (!(await openAuthorityView("commentary"))) {
      throw new Error("Virgil commentary tab not found.");
    }
    const panelReady = await waitFor(`Boolean(document.querySelector('.authority-special-case-panel'))`, 8000);
    if (!panelReady) {
      throw new Error("Virgil special-case panel missing.");
    }
    const panelText = await readText(".authority-special-case-panel");
    if (!panelText || (!panelText.includes("Special-case") && !panelText.includes("special-case"))) {
      throw new Error("Virgil special-case panel did not render recognizable shell text.");
    }
    if (!(await openAuthorityView("drilldown"))) {
      throw new Error("Virgil drilldown tab not found.");
    }
    const worksReady = await waitFor(`Boolean(document.querySelector('[data-authority-work="Aeneid"]'))`, 8000);
    if (!worksReady) {
      throw new Error("Virgil works tree did not render.");
    }
    const drilldownPanelText = await readText(".authority-special-case-panel");
    if (!drilldownPanelText || !drilldownPanelText.includes("system-wide")) {
      throw new Error("Virgil works lens lost the system-wide special-case panel.");
    }
    return {
      specialCasePanel: panelText,
      drilldownPanel: drilldownPanelText,
      contractText: await readText(".authority-reading-contract"),
      workButtons: await evaluate(`document.querySelectorAll('[data-authority-work]').length`),
    };
  });

  await test("aristotle work-only and pseudo-passage entry", async () => {
    await reopenAuthorityLens();
    await selectAuthorityAuthor("aristotle", "Aristotle");
    if (!(await openAuthorityView("drilldown"))) {
      throw new Error("Aristotle drilldown tab not found.");
    }
    const workReady = await waitFor(`Boolean(document.querySelector('[data-authority-work="Poetics"]'))`, 8000);
    if (!workReady) {
      throw new Error("Aristotle works tree view not ready.");
    }
    await click('[data-authority-work="Poetics"]');
    const bucketReady = await waitFor(`Boolean(document.querySelector('[data-authority-node="work_only"]')) && Boolean(document.querySelector('[data-authority-node="pseudo_passage"]'))`, 8000);
    if (!bucketReady) {
      throw new Error("Aristotle work-only / pseudo-passage buckets missing.");
    }

    await click('[data-authority-node="work_only"]');
    const workOnlyReady = await waitFor(`(() => {
      const heading = document.querySelector('.authority-stage-block-secondary h4')?.textContent || '';
      return heading.includes('Work-level citations') && document.querySelectorAll('[data-authority-occurrence-key]').length > 0;
    })()`, 8000);
    if (!workOnlyReady) {
      throw new Error("Aristotle work-only bucket did not expose occurrences.");
    }
    await click('[data-authority-occurrence-key]');
    const sourceHeadReady = await waitFor(`Boolean(document.querySelector('.authority-source-panel .authority-source-head h5'))`, 8000);
    if (!sourceHeadReady) {
      throw new Error("Aristotle work-only source panel did not open.");
    }

    await click('[data-authority-node="pseudo_passage"]');
    const pseudoReady = await waitFor(`(() => {
      const heading = document.querySelector('.authority-stage-block-secondary h4')?.textContent || '';
      return heading.includes('Weak locator evidence') && document.querySelectorAll('[data-authority-occurrence-key]').length > 0;
    })()`, 8000);
    if (!pseudoReady) {
      throw new Error("Aristotle pseudo-passage bucket did not expose occurrences.");
    }
    await click('[data-authority-occurrence-key]');
    const pseudoSourceReady = await waitFor(`Boolean(document.querySelector('.authority-source-panel .authority-source-head h5'))`, 8000);
    if (!pseudoSourceReady) {
      throw new Error("Aristotle pseudo-passage source panel did not open.");
    }

    return {
      selectedWork: await evaluate(`document.querySelector('[data-authority-work="Poetics"] strong')?.textContent?.trim()`),
      workOnlyHeading: "Work-level citations",
      pseudoHeading: "Weak locator evidence",
      sourceHeading: await readText(".authority-source-head h5"),
    };
  });

  await test("paul ambiguity and romans drilldown", async () => {
    await reopenAuthorityLens();
    await selectAuthorityAuthor("paul_the_apostle", "Paul");
    if (!(await openAuthorityView("drilldown"))) {
      throw new Error("Paul drilldown tab not found.");
    }
    const workReady = await waitFor(`Boolean(document.querySelector('[data-authority-work="Corinthians (ambiguous)"]')) && Boolean(document.querySelector('[data-authority-work="Epistle to the Romans"]'))`, 8000);
    if (!workReady) {
      throw new Error("Paul works tree view not ready.");
    }

    await click('[data-authority-work="Corinthians (ambiguous)"]');
    const ambiguousBucketsReady = await waitFor(`Boolean(document.querySelector('[data-authority-node="pseudo_passage"]')) && Boolean(document.querySelector('[data-authority-node="work_only"]'))`, 8000);
    if (!ambiguousBucketsReady) {
      throw new Error("Paul ambiguous work buckets missing.");
    }
    await click('[data-authority-node="pseudo_passage"]');
    const pseudoReady = await waitFor(`(() => {
      const heading = document.querySelector('.authority-stage-block-secondary h4')?.textContent || '';
      return heading.includes('Weak locator evidence') && document.querySelectorAll('[data-authority-occurrence-key]').length > 0;
    })()`, 8000);
    if (!pseudoReady) {
      throw new Error("Paul ambiguous pseudo-passage bucket did not expose occurrences.");
    }
    await click('[data-authority-occurrence-key]');
    const ambiguousSourceReady = await waitFor(`Boolean(document.querySelector('.authority-source-panel .authority-source-head h5'))`, 8000);
    if (!ambiguousSourceReady) {
      throw new Error("Paul ambiguous pseudo-passage source panel did not open.");
    }
    const ambiguousHeading = await readText(".authority-source-head h5");

    await click('[data-authority-work="Epistle to the Romans"]');
    const romansReady = await waitFor(`Boolean(document.querySelector('[data-authority-node^="structured_passage|"]')) || Boolean(document.querySelector('[data-authority-node^="prose_locator|"]'))`, 8000);
    if (!romansReady) {
      throw new Error("Paul Romans locator buckets did not expose a node.");
    }
    await evaluate(`(() => {
      const node = document.querySelector('[data-authority-node^="structured_passage|"]') || document.querySelector('[data-authority-node^="prose_locator|"]');
      if (!node) return false;
      node.click();
      return true;
    })()`);
    const romansOccReady = await waitFor(`document.querySelectorAll('[data-authority-occurrence-key]').length > 0`, 8000);
    if (!romansOccReady) {
      throw new Error("Paul Romans node did not expose occurrences.");
    }
    await click('[data-authority-occurrence-key]');
    const romansSourceReady = await waitFor(`Boolean(document.querySelector('.authority-source-panel .authority-source-head h5'))`, 8000);
    if (!romansSourceReady) {
      throw new Error("Paul Romans source panel did not open.");
    }
    return {
      ambiguousSourceHeading: ambiguousHeading,
      romansSourceHeading: await readText(".authority-source-head h5"),
    };
  });

  await test("augustine works tree entry", async () => {
    await reopenAuthorityLens();
    await selectAuthorityAuthor("augustine", "Agostino");
    if (!(await openAuthorityView("drilldown"))) {
      throw new Error("Augustine drilldown tab not found.");
    }
    const workReady = await waitFor(`Boolean(document.querySelector('[data-authority-work="Confessions"]')) && Boolean(document.querySelector('[data-authority-work="City of God"]'))`, 8000);
    if (!workReady) {
      throw new Error("Augustine work cards did not render.");
    }
    const contractText = await readText(".authority-reading-contract");
    if (!contractText || !contractText.includes("Works-tree entry")) {
      throw new Error("Augustine works-tree contract missing.");
    }
    await click('[data-authority-work="Confessions"]');
    const workSurfaceReady = await waitFor(`document.querySelectorAll('[data-authority-occurrence-key]').length > 0 || document.querySelectorAll('[data-authority-node]').length > 0`, 8000);
    if (!workSurfaceReady) {
      throw new Error("Augustine work tree did not expose a node or occurrence surface.");
    }
    await evaluate(`(() => {
      const preferred = document.querySelector('[data-authority-node="work_only"]');
      if (preferred) {
        preferred.click();
        return 'work_only';
      }
      const candidate = document.querySelector('[data-authority-node]');
      if (candidate) {
        candidate.click();
        return candidate.getAttribute('data-authority-node') || 'node';
      }
      return null;
    })()`);
    const rowsReady = await waitFor(`document.querySelectorAll('[data-authority-occurrence-key]').length > 0`, 8000);
    if (!rowsReady) {
      throw new Error("Augustine Confessions occurrences did not render.");
    }
    await click('[data-authority-occurrence-key]');
    const sourceReady = await waitFor(`Boolean(document.querySelector('.authority-source-panel .authority-source-head h5'))`, 8000);
    if (!sourceReady) {
      throw new Error("Augustine source panel did not open.");
    }
    return {
      contractText,
      sourceHeading: await readText(".authority-source-head h5"),
    };
  });

  await test("tommaso locator flat-work lane", async () => {
    await reopenAuthorityLens();
    await selectAuthorityAuthor("tommaso_daquino", "Tommaso");
    if (!(await openAuthorityView("drilldown"))) {
      throw new Error("Tommaso drilldown tab not found.");
    }
    const workReady = await waitFor(`Boolean(document.querySelector('[data-authority-work="Summa theologiae"]')) && document.querySelectorAll('[data-authority-work]').length > 1`, 12000);
    if (!workReady) {
      throw new Error("Tommaso work cards did not render.");
    }
    await click('[data-authority-work="Summa theologiae"]');
    const rowsReady = await waitFor(`document.querySelectorAll('[data-authority-occurrence-key]').length > 0`, 8000);
    if (!rowsReady) {
      throw new Error("Tommaso Summa occurrences did not render.");
    }
    await click('[data-authority-occurrence-key]');
    const sourceReady = await waitFor(`Boolean(document.querySelector('.authority-source-panel .authority-source-head h5'))`, 8000);
    if (!sourceReady) {
      throw new Error("Tommaso source panel did not open.");
    }
    const contractText = await readText(".authority-reading-contract");
    return {
      sourceHeading: await readText(".authority-source-head h5"),
      contractText: contractText || await readText(".authority-caveat-banner"),
    };
  });

  await test("ovid works tree lane", async () => {
    await reopenAuthorityLens();
    await selectAuthorityAuthor("ovid", "Ovid");
    if (!(await openAuthorityView("drilldown"))) {
      throw new Error("Ovid drilldown tab not found.");
    }
    const workReady = await waitFor(`Boolean(document.querySelector('[data-authority-work="Metamorphoses"]')) && Boolean(document.querySelector('[data-authority-work="Heroides"]'))`, 12000);
    if (!workReady) {
      throw new Error("Ovid work cards did not render.");
    }
    const contractText = await readText(".authority-reading-contract");
    if (!contractText || !contractText.includes("Works-tree entry")) {
      throw new Error("Ovid works-tree contract missing.");
    }
    await click('[data-authority-work="Metamorphoses"]');
    const workSurfaceReady = await waitFor(`document.querySelectorAll('[data-authority-occurrence-key]').length > 0 || document.querySelectorAll('[data-authority-node]').length > 0`, 8000);
    if (!workSurfaceReady) {
      throw new Error("Ovid work tree did not expose a node or occurrence surface.");
    }
    await evaluate(`(() => {
      const preferred = document.querySelector('[data-authority-node="work_only"]');
      if (preferred) {
        preferred.click();
        return 'work_only';
      }
      const candidate = document.querySelector('[data-authority-node]');
      if (candidate) {
        candidate.click();
        return candidate.getAttribute('data-authority-node') || 'node';
      }
      return null;
    })()`);
    const rowsReady = await waitFor(`document.querySelectorAll('[data-authority-occurrence-key]').length > 0`, 8000);
    if (!rowsReady) {
      throw new Error("Ovid Metamorphoses occurrences did not render.");
    }
    await click('[data-authority-occurrence-key]');
    const sourceReady = await waitFor(`Boolean(document.querySelector('.authority-source-panel .authority-source-head h5'))`, 8000);
    if (!sourceReady) {
      throw new Error("Ovid source panel did not open.");
    }
    return {
      contractText,
      sourceHeading: await readText(".authority-source-head h5"),
    };
  });

  await test("seneca works tree lane", async () => {
    await reopenAuthorityLens();
    await selectAuthorityAuthor("seneca", "Seneca");
    if (!(await openAuthorityView("drilldown"))) {
      throw new Error("Seneca drilldown tab not found.");
    }
    const workReady = await waitFor(`Boolean(document.querySelector('[data-authority-work="Epistulae morales"]'))`, 12000);
    if (!workReady) {
      throw new Error("Seneca work cards did not render.");
    }
    const contractText = await readText(".authority-reading-contract");
    if (!contractText || !contractText.includes("Works-tree entry")) {
      throw new Error("Seneca works-tree contract missing.");
    }
    await click('[data-authority-work="Epistulae morales"]');
    const workSurfaceReady = await waitFor(`document.querySelectorAll('[data-authority-occurrence-key]').length > 0 || document.querySelectorAll('[data-authority-node]').length > 0`, 8000);
    if (!workSurfaceReady) {
      throw new Error("Seneca work tree did not expose a node or occurrence surface.");
    }
    await evaluate(`(() => {
      const preferred = document.querySelector('[data-authority-node="work_only"]');
      if (preferred) {
        preferred.click();
        return 'work_only';
      }
      const candidate = document.querySelector('[data-authority-node]');
      if (candidate) {
        candidate.click();
        return candidate.getAttribute('data-authority-node') || 'node';
      }
      return null;
    })()`);
    const rowsReady = await waitFor(`document.querySelectorAll('[data-authority-occurrence-key]').length > 0`, 8000);
    if (!rowsReady) {
      throw new Error("Seneca Epistulae occurrences did not render.");
    }
    await click('[data-authority-occurrence-key]');
    const sourceReady = await waitFor(`Boolean(document.querySelector('.authority-source-panel .authority-source-head h5'))`, 8000);
    if (!sourceReady) {
      throw new Error("Seneca source panel did not open.");
    }
    return {
      contractText,
      sourceHeading: await readText(".authority-source-head h5"),
    };
  });

  await test("boethius works tree lane", async () => {
    await reopenAuthorityLens();
    await selectAuthorityAuthor("boethius", "Boethius");
    if (!(await openAuthorityView("drilldown"))) {
      throw new Error("Boethius drilldown tab not found.");
    }
    const workReady = await waitFor(`Boolean(document.querySelector('[data-authority-work="Consolation of Philosophy"]'))`, 12000);
    if (!workReady) {
      throw new Error("Boethius work cards did not render.");
    }
    const contractText = await readText(".authority-reading-contract");
    if (!contractText || !contractText.includes("Works-tree entry")) {
      throw new Error("Boethius works-tree contract missing.");
    }
    await click('[data-authority-work="Consolation of Philosophy"]');
    const workSurfaceReady = await waitFor(`document.querySelectorAll('[data-authority-occurrence-key]').length > 0 || document.querySelectorAll('[data-authority-node]').length > 0`, 8000);
    if (!workSurfaceReady) {
      throw new Error("Boethius work tree did not expose a node or occurrence surface.");
    }
    await evaluate(`(() => {
      const preferred = document.querySelector('[data-authority-node="work_only"]');
      if (preferred) {
        preferred.click();
        return 'work_only';
      }
      const candidate = document.querySelector('[data-authority-node]');
      if (candidate) {
        candidate.click();
        return candidate.getAttribute('data-authority-node') || 'node';
      }
      return null;
    })()`);
    const rowsReady = await waitFor(`document.querySelectorAll('[data-authority-occurrence-key]').length > 0`, 8000);
    if (!rowsReady) {
      throw new Error("Boethius Consolation occurrences did not render.");
    }
    await click('[data-authority-occurrence-key]');
    const sourceReady = await waitFor(`Boolean(document.querySelector('.authority-source-panel .authority-source-head h5'))`, 8000);
    if (!sourceReady) {
      throw new Error("Boethius source panel did not open.");
    }
    return {
      contractText,
      sourceHeading: await readText(".authority-source-head h5"),
    };
  });

  const payload = {
    ok: failures.length === 0,
    resultCount: results.length,
    results,
    failures,
  };
  writeSmokeArtifacts(payload);
  console.log(JSON.stringify(payload, null, 2));

  ws.close();
  process.exit(failures.length ? 1 : 0);
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    fatal: error.message || String(error),
  }, null, 2));
  process.exit(1);
});
