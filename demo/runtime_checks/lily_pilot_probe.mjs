#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const DEBUG_PORT = process.env.CDP_PORT || "9333";
const DEBUG_HOST = process.env.CDP_HOST || "127.0.0.1";
const DEMO_URL = process.env.DEMO_URL || "http://127.0.0.1:8777/";
const execFileAsync = promisify(execFile);

function normalizeComparableUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    return `${url.origin}${url.pathname}${url.search}`;
  } catch (_error) {
    return String(rawUrl || "");
  }
}

function isDemoTarget(targetUrl) {
  return normalizeComparableUrl(targetUrl) === normalizeComparableUrl(DEMO_URL);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
  let pageTarget = targets.find((target) => target.type === "page" && isDemoTarget(target.url));

  if (pageTarget?.webSocketDebuggerUrl) {
    return pageTarget;
  }

  if (!version?.webSocketDebuggerUrl) {
    throw new Error("Could not find browser websocket endpoint.");
  }

  const browser = await connectDebugger(version.webSocketDebuggerUrl);
  try {
    const created = await browser.send("Target.createTarget", { url: DEMO_URL });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await sleep(250);
      targets = await fetchJson(`http://${DEBUG_HOST}:${DEBUG_PORT}/json/list`);
      pageTarget = targets.find((target) =>
        target.type === "page" && (target.id === created.targetId || isDemoTarget(target.url))
      );
      if (pageTarget?.webSocketDebuggerUrl) {
        return pageTarget;
      }
    }
  } finally {
    browser.ws.close();
  }

  throw new Error("Could not find page target for demo frontend.");
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
  await send("Page.navigate", { url: DEMO_URL });
  await waitFor(`document.readyState === "complete"`);
  await waitFor(`Boolean(window.DDPAppShellReady)`);
  await evaluate(`window.DDPAppShellReady`);

  await evaluate(`(() => {
    const input = document.getElementById("quick-jump-input");
    const form = document.getElementById("quick-jump-form");
    if (!input || !form) {
      return false;
    }
    input.value = "manibus o lilia date plenis";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    return true;
  })()`);

  const searchTriggered = await waitFor(`(() => {
    const ctx = window.DDPAppShell?.getCurrentContext?.() || {};
    const active = Boolean(document.querySelector(".lily-fall-overlay.is-active"));
    const itemCount = document.querySelectorAll(".lily-fall-item").length;
    if (ctx.manifestEntry?.id !== "purgatorio30" || ctx.selectedLine !== 21 || !active || itemCount < 1) {
      return null;
    }
    return {
      sampleId: ctx.manifestEntry.id,
      selectedLine: ctx.selectedLine,
      active,
      itemCount,
      lineText: document.querySelector("#line-context .current-line-text")?.textContent?.trim() || null,
      hash: window.location.hash || null
    };
  })()`);

  await sleep(1800);

  await evaluate(`(async () => {
    await window.DDPAppShell.jumpToSampleLine("purgatorio30", 20, null, { suppressCoverageScroll: true });
    await window.DDPAppShell.jumpToSampleLine("purgatorio30", 21, null, { suppressCoverageScroll: true });
    window.location.hash = "#records-section";
    return true;
  })()`);

  const lineTriggered = await waitFor(`(() => {
    const ctx = window.DDPAppShell?.getCurrentContext?.() || {};
    const active = Boolean(document.querySelector(".lily-fall-overlay.is-active"));
    const itemCount = document.querySelectorAll(".lily-fall-item").length;
    if (ctx.manifestEntry?.id !== "purgatorio30" || ctx.selectedLine !== 21 || !active || itemCount < 1) {
      return null;
    }
    return {
      sampleId: ctx.manifestEntry.id,
      selectedLine: ctx.selectedLine,
      active,
      itemCount,
      inputValue: document.getElementById("quick-jump-input")?.value || null
    };
  })()`);

  console.log(JSON.stringify({
    demoUrl: DEMO_URL,
    debugPort: DEBUG_PORT,
    searchTriggered,
    lineTriggered,
  }, null, 2));

  ws.close();
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
