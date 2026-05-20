#!/usr/bin/env node

import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";

const DEBUG_HOST = process.env.CDP_HOST || "127.0.0.1";
const DEBUG_PORT = process.env.CDP_PORT || "9222";
const DEMO_URL = process.env.DEMO_URL || "http://127.0.0.1:8777/?sample=purgatorio30&line=48&locus=fiamma&ui_lang=en#records-section";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "demo/frontend/static/route-tour";
const JOB_FILTER = new Set(
  String(process.env.JOBS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);
async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchText(url) {
  const client = String(url).startsWith("https:") ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 400) {
        reject(new Error(`Fetch failed ${response.statusCode}: ${url}`));
        response.resume();
        return;
      }
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => resolve(body));
    });
    request.on("error", reject);
  });
}

async function fetchJson(url, attempts = 20, delayMs = 250) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const body = await fetchText(url);
      if (!body || !body.trim()) {
        throw new Error(`Empty response: ${url}`);
      }
      return JSON.parse(body);
    } catch (error) {
      lastError = error;
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
  const targets = await fetchJson(`http://${DEBUG_HOST}:${DEBUG_PORT}/json/list`);
  const comparable = DEMO_URL.replace(/#.*$/, "");
  const pageTarget = targets.find((target) =>
    target.type === "page"
      && String(target.url || "").replace(/#.*$/, "") === comparable
  ) || targets.find((target) => target.type === "page");

  if (pageTarget?.webSocketDebuggerUrl) {
    return pageTarget;
  }
  throw new Error("Could not find page target for demo frontend.");
}

async function connectToPage() {
  const pageTarget = await ensureDemoPageTarget();
  return connectDebugger(pageTarget.webSocketDebuggerUrl);
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const { ws, send } = await connectToPage();

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    return result.result?.value;
  }

  async function waitFor(expression, timeoutMs = 20000) {
    const start = Date.now();
    while ((Date.now() - start) < timeoutMs) {
      const ok = await evaluate(expression);
      if (ok) {
        return true;
      }
      await sleep(200);
    }
    return false;
  }

  async function click(selector) {
    return evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return false;
      node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      return true;
    })()`);
  }

  async function navigate(url) {
    await send("Page.enable");
    await send("DOM.enable");
    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: 1600,
      height: 2200,
      deviceScaleFactor: 2,
      mobile: false,
      screenWidth: 1600,
      screenHeight: 2200,
    });
    await send("Page.navigate", { url });
    await waitFor("document.readyState === 'complete'", 20000);
    await waitFor("Boolean(window.DDPState && document.querySelector('#coverage-section'))", 20000);
    await waitFor("Boolean(document.querySelector('.analysis-summary'))", 30000);
    await waitFor("Boolean(document.querySelector('#records-list .record-card'))", 30000);
    await waitFor("Boolean(document.querySelector('#semantic-panel .semantic-field-grid'))", 30000);
    await waitFor("Boolean(document.querySelector('#vocabulary-panel .vocabulary-section'))", 30000);
    await waitFor("Boolean(document.querySelector('#recurrence-panel .vocabulary-section'))", 30000);
    await waitFor("Boolean(document.querySelector('#scholar-section'))", 30000);
    await sleep(1000);
  }

  async function ensureCompareState() {
    await click("#records-list .record-card .pin-button");
    await sleep(150);
    await click("#records-list .record-card:nth-of-type(2) .pin-button");
    await waitFor("document.querySelectorAll('#compare-list .compare-card').length >= 1", 10000);
  }

  async function expandFirstRecord() {
    await click("#records-list .record-card .inline-text-button");
    await sleep(300);
  }

  async function getClip(config) {
    const value = await evaluate(`(() => {
      const maxHeight = ${JSON.stringify(config.maxHeight || null)};
      const padding = ${Number(config.padding || 24)};

      function rectFromNode(node) {
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        if (!rect || rect.width <= 0 || rect.height <= 0) return null;
        return {
          left: rect.left + window.scrollX,
          top: rect.top + window.scrollY,
          right: rect.right + window.scrollX,
          bottom: rect.bottom + window.scrollY,
        };
      }

      function findByHeading(rootSelector, text) {
        const root = rootSelector ? document.querySelector(rootSelector) : document;
        if (!root) return null;
        const headings = [...root.querySelectorAll("h3, h4")];
        const expected = String(text || "").trim().toLowerCase();
        const match = headings.find((node) => {
          const current = String(node.textContent || "").trim().toLowerCase();
          return current.startsWith(expected) || current.includes(expected);
        });
        if (!match) return null;
        return match.closest(".vocabulary-section, .vocabulary-section-interpretive, .micro-context-card, .panel, .analysis-summary, .record-card") || match.parentElement || match;
      }

      const rects = [];
      for (const selector of ${JSON.stringify(config.selectors || [])}) {
        document.querySelectorAll(selector).forEach((node) => {
          const rect = rectFromNode(node);
          if (rect) rects.push(rect);
        });
      }
      if (${JSON.stringify(Boolean(config.headingText))}) {
        const node = findByHeading(${JSON.stringify(config.headingRoot || null)}, ${JSON.stringify(config.headingText || "")});
        const rect = rectFromNode(node);
        if (rect) rects.push(rect);
      }
      if (!rects.length) {
        return null;
      }
      const union = rects.reduce((acc, rect) => ({
        left: Math.min(acc.left, rect.left),
        top: Math.min(acc.top, rect.top),
        right: Math.max(acc.right, rect.right),
        bottom: Math.max(acc.bottom, rect.bottom),
      }));
      let width = union.right - union.left;
      let height = union.bottom - union.top;
      let x = Math.max(0, union.left - padding);
      let y = Math.max(0, union.top - padding);
      width += padding * 2;
      height += padding * 2;
      if (maxHeight && height > maxHeight) {
        height = maxHeight;
      }
      return {
        x,
        y,
        width: Math.min(width, document.documentElement.scrollWidth - x),
        height: Math.min(height, document.documentElement.scrollHeight - y),
      };
    })()`);
      if (!value) {
      throw new Error(`Could not compute clip for ${config.name}`);
    }
    return value;
  }

  async function isolateTarget(config) {
    const isolated = await evaluate(`(() => {
      function findByHeading(rootSelector, text) {
        const root = rootSelector ? document.querySelector(rootSelector) : document;
        if (!root) return null;
        const headings = [...root.querySelectorAll("h3, h4")];
        const expected = String(text || "").trim().toLowerCase();
        const match = headings.find((node) => {
          const current = String(node.textContent || "").trim().toLowerCase();
          return current.startsWith(expected) || current.includes(expected);
        });
        if (!match) return null;
        return match.closest(".vocabulary-section, .vocabulary-section-interpretive, .micro-context-card, .panel, .analysis-summary, .record-card, .semantic-panel, .recurrence-panel, .compare-panel, .scholar-panel") || match.parentElement || match;
      }

      let node = null;
      for (const selector of ${JSON.stringify(config.selectors || [])}) {
        node = document.querySelector(selector);
        if (node) break;
      }
      if (!node && ${JSON.stringify(Boolean(config.headingText))}) {
        node = findByHeading(${JSON.stringify(config.headingRoot || null)}, ${JSON.stringify(config.headingText || "")});
      }
      if (!node) {
        return false;
      }

      const wrapper = document.createElement("main");
      wrapper.className = "page-shell";
      wrapper.style.maxWidth = "1280px";
      wrapper.style.margin = "0 auto";
      wrapper.style.padding = "24px";
      wrapper.appendChild(node.cloneNode(true));

      document.body.className = "";
      document.body.innerHTML = "";
      document.body.style.background = "#f6efe3";
      document.body.style.margin = "0";
      document.body.appendChild(wrapper);
      window.scrollTo({ top: 0, behavior: "instant" });
      return true;
    })()`);
    if (!isolated) {
      throw new Error(`Could not isolate node for ${config.name}`);
    }
    await sleep(250);
  }

  async function capture(config) {
    if (config.isolate) {
      await isolateTarget(config);
    }
    const clip = await getClip(config);
    await evaluate(`window.scrollTo({ top: ${Math.max(0, clip.y - 32)}, behavior: "instant" })`);
    await sleep(250);
    const screenshot = await send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: {
        x: clip.x,
        y: clip.y,
        width: clip.width,
        height: clip.height,
        scale: 1,
      },
    });
    const outputPath = path.join(OUTPUT_DIR, config.file);
    await fs.writeFile(outputPath, Buffer.from(screenshot.data, "base64"));
    return outputPath;
  }

  try {
    await navigate(DEMO_URL);
    await expandFirstRecord();
    await ensureCompareState();

    const jobs = [
      {
        name: "main-entry",
        file: "tour-main-entry.png",
        selectors: ["#coverage-section"],
        maxHeight: 520,
      },
      {
        name: "analysis-layer",
        file: "tour-analysis-layer.png",
        selectors: [".analysis-summary"],
        isolate: true,
        maxHeight: 900,
      },
      {
        name: "close-reading",
        file: "tour-close-reading.png",
        selectors: ["#records-section .panel-head", "#line-context"],
        maxHeight: 720,
      },
      {
        name: "commentary-cards",
        file: "tour-commentary-cards.png",
        selectors: ["#records-list .record-card"],
        isolate: true,
        maxHeight: 860,
      },
      {
        name: "dante-word-locus",
        file: "tour-dante-word-locus.png",
        selectors: [
          "#vocabulary-panel > .semantic-kicker",
          "#vocabulary-panel > .section-title-with-help",
          "#vocabulary-panel > .locus-meta-row",
        ],
        maxHeight: 520,
      },
      {
        name: "occurrence-explorer",
        file: "tour-occurrence-explorer.png",
        headingRoot: "#vocabulary-panel",
        headingText: "Occurrence Explorer",
        maxHeight: 920,
      },
      {
        name: "weighted-micro-context-concurrence",
        file: "tour-weighted-micro-context.png",
        headingRoot: "#vocabulary-panel",
        headingText: "Weighted Micro-Context Concurrence",
        maxHeight: 920,
      },
      {
        name: "exact-local-phrase-expansions",
        file: "tour-exact-local-phrase-expansions.png",
        headingRoot: "#vocabulary-panel",
        headingText: "Local Phrase Expansions",
        maxHeight: 760,
      },
      {
        name: "contrastive-interpretive-vocabulary",
        file: "tour-contrastive-interpretive-vocabulary.png",
        headingRoot: "#vocabulary-panel",
        headingText: "Contrastive Interpretive Vocabulary",
        maxHeight: 760,
      },
      {
        name: "interpretive-fields",
        file: "tour-interpretive-fields.png",
        selectors: ["#semantic-panel"],
        maxHeight: 760,
      },
      {
        name: "cross-canto-echoes",
        file: "tour-cross-canto-echoes.png",
        selectors: ["#recurrence-panel"],
        maxHeight: 760,
      },
      {
        name: "compare",
        file: "tour-compare.png",
        selectors: ["#compare-section .panel-head", "#compare-summary", "#compare-list .compare-card"],
        maxHeight: 760,
      },
      {
        name: "authority",
        file: "tour-authority.png",
        selectors: ["#scholar-section .panel-head", "#figure-panel"],
        maxHeight: 760,
      },
    ];

    const outputs = [];
    for (const job of jobs.filter((item) => !JOB_FILTER.size || JOB_FILTER.has(item.name))) {
      console.error(`capturing ${job.name}`);
      outputs.push(await capture(job));
      console.error(`captured ${job.name}`);
    }

    console.error(JSON.stringify({ ok: true, outputs }, null, 2));
  } finally {
    ws.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
