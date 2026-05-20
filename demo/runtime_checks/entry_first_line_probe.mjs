#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const DEBUG_PORT = process.env.CDP_PORT || "9444";
const DEBUG_HOST = process.env.CDP_HOST || "127.0.0.1";
const DEMO_URL = process.env.DEMO_URL || "http://127.0.0.1:8777/";
const SAMPLE_IDS = (process.env.SAMPLE_IDS || "inferno1,purgatorio20,paradiso1")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const execFileAsync = promisify(execFile);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
        const { stdout } = await execFileAsync("/usr/bin/curl", ["-s", url]);
        if (!stdout || !stdout.trim()) {
          throw new Error(`Empty curl response: ${url}`);
        }
        return JSON.parse(stdout);
      } catch (curlError) {
        lastError = curlError;
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

  ws.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (!payload.id) {
      return;
    }
    const resolver = pending.get(payload.id);
    if (!resolver) {
      return;
    }
    pending.delete(payload.id);
    if (payload.error) {
      resolver.reject(new Error(payload.error.message || "CDP command failed"));
      return;
    }
    resolver.resolve(payload.result);
  });

  function send(method, params = {}) {
    const commandId = ++id;
    ws.send(JSON.stringify({ id: commandId, method, params }));
    return new Promise((resolve, reject) => {
      pending.set(commandId, { resolve, reject });
    });
  }

  return { ws, send };
}

async function ensureDemoPageTarget() {
  const version = await fetchJson(`http://${DEBUG_HOST}:${DEBUG_PORT}/json/version`);
  let targets = await fetchJson(`http://${DEBUG_HOST}:${DEBUG_PORT}/json/list`);
  let pageTarget = targets.find((target) => target.type === "page" && target.url === "about:blank");

  if (pageTarget?.webSocketDebuggerUrl) {
    return pageTarget;
  }

  if (!version?.webSocketDebuggerUrl) {
    throw new Error("Could not find browser websocket endpoint.");
  }

  const browser = await connectDebugger(version.webSocketDebuggerUrl);
  try {
    const created = await browser.send("Target.createTarget", { url: "about:blank" });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await sleep(200);
      targets = await fetchJson(`http://${DEBUG_HOST}:${DEBUG_PORT}/json/list`);
      pageTarget = targets.find((target) => target.type === "page" && target.id === created.targetId);
      if (pageTarget?.webSocketDebuggerUrl) {
        return pageTarget;
      }
    }
  } finally {
    browser.ws.close();
  }

  throw new Error("Could not find page target for probe.");
}

async function main() {
  const pageTarget = await ensureDemoPageTarget();
  const { ws, send } = await connectDebugger(pageTarget.webSocketDebuggerUrl);

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    return result.result?.value;
  }

  async function waitFor(checkExpression, timeoutMs = 12000) {
    const start = Date.now();
    while ((Date.now() - start) < timeoutMs) {
      const value = await evaluate(checkExpression);
      if (value) {
        return value;
      }
      await sleep(150);
    }
    throw new Error(`Timed out waiting for expression: ${checkExpression}`);
  }

  await send("Page.enable");
  await send("Runtime.enable");

  const results = [];

  for (const sampleId of SAMPLE_IDS) {
    await send("Page.navigate", { url: DEMO_URL });
    await waitFor(`document.readyState === "complete"`);
    await waitFor(`Boolean(window.DDPAppShellReady)`);
    await evaluate(`window.DDPAppShellReady`);

    await waitFor(`Boolean(document.querySelector('.canto-chip[data-sample-id="${sampleId}"]'))`);
    await evaluate(`(() => {
      const button = document.querySelector('.canto-chip[data-sample-id="${sampleId}"]');
      if (!button) return false;
      button.click();
      return true;
    })()`);

    await waitFor(`(() => {
      const ctx = window.DDPAppShell?.getCurrentContext?.() || {};
      return ctx.manifestEntry?.id === "${sampleId}" && document.querySelector('.coverage-row');
    })()`, 15000);

    await sleep(1800);

    const snapshot = await evaluate(`(() => {
      const ctx = window.DDPAppShell?.getCurrentContext?.() || {};
      const list = document.getElementById('coverage-list');
      const rows = Array.from(document.querySelectorAll('.coverage-row'));
      const firstRow = rows[0];
      const visibleRows = rows
        .map((row) => {
          const rect = row.getBoundingClientRect();
          return {
            lineNumber: Number(row.dataset.lineNumber || 0),
            top: rect.top,
            bottom: rect.bottom,
          };
        })
        .filter((row) => row.bottom > 0 && row.top < window.innerHeight);
      const firstVisible = visibleRows[0] || null;
      return {
        sampleId: ctx.manifestEntry?.id || null,
        title: ctx.manifestEntry?.title || null,
        url: window.location.href,
        selectedLine: ctx.selectedLine ?? null,
        coverageScrollTop: list?.scrollTop ?? null,
        firstRowLine: firstRow ? Number(firstRow.dataset.lineNumber || 0) : null,
        firstVisibleLine: firstVisible?.lineNumber ?? null,
        visibleLines: visibleRows.slice(0, 8).map((row) => row.lineNumber),
      };
    })()`);

    results.push(snapshot);
  }

  console.log(JSON.stringify({
    demoUrl: DEMO_URL,
    debugPort: DEBUG_PORT,
    samples: results,
  }, null, 2));

  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
