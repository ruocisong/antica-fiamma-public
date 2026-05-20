#!/usr/bin/env node

const DEBUG_HOST = process.env.CDP_HOST || "127.0.0.1";
const DEBUG_PORT = process.env.CDP_PORT || "9333";
const DEMO_URL = process.env.DEMO_URL || "http://127.0.0.1:8777/?sample=purgatorio24&line=119";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}: ${url}`);
  }
  return response.json();
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
    if (!payload.id) return;
    const resolver = pending.get(payload.id);
    if (!resolver) return;
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
  const browser = await connectDebugger(version.webSocketDebuggerUrl);
  try {
    const created = await browser.send("Target.createTarget", { url: DEMO_URL });
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await sleep(250);
      const targets = await fetchJson(`http://${DEBUG_HOST}:${DEBUG_PORT}/json/list`);
      const pageTarget = targets.find((target) => target.type === "page" && target.id === created.targetId);
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

  async function waitFor(checkExpression, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const value = await evaluate(checkExpression);
      if (value) return value;
      await sleep(150);
    }
    throw new Error(`Timed out waiting for: ${checkExpression}`);
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.navigate", { url: DEMO_URL });
  await waitFor(`document.readyState === "complete"`);
  await waitFor(`Boolean(window.DDPAppShellReady)`);
  await evaluate(`window.DDPAppShellReady`);
  await waitFor(`document.querySelectorAll('.record-card').length > 0`);

  await evaluate(`(() => {
    document.querySelectorAll('.record-actions.is-expand-toggle-row').forEach((row, index) => {
      if (index < 3) row.click();
    });
    return true;
  })()`);

  await sleep(800);

  const result = await evaluate(`(() => {
    const marks = [...document.querySelectorAll('.record-card mark')]
      .filter((mark) => /virgil/i.test(mark.textContent || ''))
      .map((mark) => ({
        text: mark.textContent || '',
        className: mark.className,
      }));
    return {
      markCount: marks.length,
      marks: marks.slice(0, 12),
      previewTexts: [...document.querySelectorAll('.record-card .record-preview')].slice(0, 2).map((node) => node.textContent?.slice(0, 500) || ''),
    };
  })()`);

  console.log(JSON.stringify(result, null, 2));
  ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
