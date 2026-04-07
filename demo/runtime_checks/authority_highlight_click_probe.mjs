const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getPages() {
  const response = await fetch("http://127.0.0.1:9333/json/list");
  return await response.json();
}

function makeClient(wsUrl) {
  let id = 0;
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const events = new Map();

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id) {
      const pendingEntry = pending.get(msg.id);
      if (!pendingEntry) {
        return;
      }
      pending.delete(msg.id);
      if (msg.error) {
        pendingEntry.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      } else {
        pendingEntry.resolve(msg.result || {});
      }
      return;
    }
    const listeners = events.get(msg.method) || [];
    for (const listener of listeners) {
      listener(msg.params || {});
    }
  });

  return {
    open() {
      return new Promise((resolve, reject) => {
        ws.addEventListener("open", () => resolve(), { once: true });
        ws.addEventListener("error", reject, { once: true });
      });
    },
    send(method, params = {}) {
      const msgId = ++id;
      ws.send(JSON.stringify({ id: msgId, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(msgId, { resolve, reject });
      });
    },
    once(method) {
      return new Promise((resolve) => {
        const handler = (params) => {
          const listeners = events.get(method) || [];
          events.set(method, listeners.filter((listener) => listener !== handler));
          resolve(params);
        };
        const listeners = events.get(method) || [];
        listeners.push(handler);
        events.set(method, listeners);
      });
    },
    close() {
      ws.close();
    },
  };
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.result?.value;
}

async function clickSelectorWithMouse(client, selector) {
  const point = await evaluate(
    client,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        text: el.textContent.trim(),
        cls: el.className,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    })()`
  );
  if (!point) {
    return null;
  }
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  return { text: point.text, cls: point.cls };
}

async function clickPersonaggioMark(client) {
  const point = await evaluate(
    client,
    `(() => {
      const candidates = Array.from(document.querySelectorAll('.authority-hit-personaggio,.authority-hit-personaggio-caveated,.authority-hit-personaggio-cue'));
      const preferred = candidates.find((el) => /buon maestro/i.test(el.textContent || ''))
        || candidates.find((el) => el.classList.contains('authority-hit-personaggio'))
        || candidates[0];
      if (!preferred) return null;
      const rect = preferred.getBoundingClientRect();
      return {
        text: preferred.textContent.trim(),
        cls: preferred.className,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    })()`
  );
  if (!point) {
    return null;
  }
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: point.x,
    y: point.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
  });
  return { text: point.text, cls: point.cls };
}

async function navigate(client, url) {
  const loaded = client.once("Page.loadEventFired");
  await client.send("Page.navigate", { url });
  await loaded;
  await sleep(1200);
}

async function main() {
  const pages = await getPages();
  const page = pages.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
  if (!page) {
    throw new Error("No Chrome page target found");
  }

  const client = makeClient(page.webSocketDebuggerUrl);
  await client.open();
  await client.send("Page.enable");
  await client.send("Runtime.enable");

  const results = {};
  const authorWorkRoute = "http://127.0.0.1:8777/inferno/1/1";
  const personaggioRoute = "http://127.0.0.1:8777/inferno/18/82";

  await navigate(client, authorWorkRoute);
  results.rootMarks = await evaluate(
    client,
    `(() => ({
      author: Array.from(document.querySelectorAll('.authority-hit-author')).slice(0, 3).map((el) => el.textContent.trim()),
      work: Array.from(document.querySelectorAll('.authority-hit-work,.authority-hit-work-caveated')).slice(0, 3).map((el) => ({ text: el.textContent.trim(), cls: el.className })),
      personaggio: Array.from(document.querySelectorAll('.authority-hit-personaggio,.authority-hit-personaggio-cue,.authority-hit-personaggio-caveated')).slice(0, 3).map((el) => ({ text: el.textContent.trim(), cls: el.className })),
    }))()`
  );

  results.authorClicked = await evaluate(
    client,
    `(() => {
      const el = document.querySelector('.authority-hit-author');
      if (!el) return null;
      const label = el.textContent.trim();
      el.click();
      return label;
    })()`
  );
  await sleep(1500);
  results.authorAfter = await evaluate(
    client,
    `(() => ({
      authorityTabActive: !!document.querySelector('.lens-tab[data-lens-tab="authority"].is-active'),
      activeAuthor: document.querySelector('[data-authority-id].is-active')?.textContent?.trim() || null,
      activeView: document.querySelector('[data-authority-view].is-active')?.textContent?.trim() || null,
    }))()`
  );

  await navigate(client, authorWorkRoute);
  results.workClicked = await evaluate(
    client,
    `(() => {
      const el = document.querySelector('.authority-hit-work,.authority-hit-work-caveated');
      if (!el) return null;
      const payload = { text: el.textContent.trim(), cls: el.className };
      el.click();
      return payload;
    })()`
  );
  await sleep(1800);
  results.workAfter = await evaluate(
    client,
    `(() => ({
      authorityTabActive: !!document.querySelector('.lens-tab[data-lens-tab="authority"].is-active'),
      activeAuthor: document.querySelector('[data-authority-id].is-active')?.textContent?.trim() || null,
      activeView: document.querySelector('[data-authority-view].is-active')?.textContent?.trim() || null,
      activeWork: document.querySelector('[data-authority-work].is-active')?.textContent?.trim() || null,
    }))()`
  );

  const beforePages = await getPages();
  await navigate(client, personaggioRoute);
  await evaluate(
    client,
    `(() => {
      window.__ddpLastOpen = null;
      const originalOpen = window.open.bind(window);
      window.open = (...args) => {
        window.__ddpLastOpen = args;
        try {
          return originalOpen(...args);
        } catch (error) {
          return null;
        }
      };
      return true;
    })()`
  );
  results.personaggioClicked = await clickPersonaggioMark(client);
  await sleep(1200);
  const afterPages = await getPages();
  const beforeIds = new Set(beforePages.map((entry) => entry.id));
  const newPages = afterPages.filter((entry) => !beforeIds.has(entry.id));
  results.personaggioAfter = {
    newPageCount: newPages.length,
    newPageUrls: newPages.map((entry) => entry.url),
    interceptedWindowOpen: await evaluate(
      client,
      `(() => window.__ddpLastOpen || null)()`
    ),
  };

  await navigate(client, personaggioRoute);
  results.personaggioSynthetic = await evaluate(
    client,
    `(async () => {
      window.__ddpLastOpen = null;
      const originalOpen = window.open.bind(window);
      window.open = (...args) => {
        window.__ddpLastOpen = args;
        try {
          return originalOpen(...args);
        } catch (error) {
          return null;
        }
      };
      const stableMark = document.createElement('mark');
      stableMark.className = 'authority-hit-personaggio';
      stableMark.textContent = 'poeta';
      await handleAuthorityHighlightClick(stableMark);
      const stableOpen = window.__ddpLastOpen || null;
      window.__ddpLastOpen = null;
      const cueMark = document.createElement('mark');
      cueMark.className = 'authority-hit-personaggio-cue';
      cueMark.textContent = 'autore';
      await handleAuthorityHighlightClick(cueMark);
      return {
        resolvedStable: resolveAuthorityHighlightPersonaggio('poeta', 'stable'),
        resolvedCue: resolveAuthorityHighlightPersonaggio('poeta', 'cue'),
        resolvedCueAutore: resolveAuthorityHighlightPersonaggio('autore', 'cue'),
        stableHref: getPersonaggioStaticPageHref(resolveAuthorityHighlightPersonaggio('poeta', 'stable')?.page_slug),
        cueHref: getPersonaggioStaticPageHref(resolveAuthorityHighlightPersonaggio('autore', 'cue')?.page_slug),
        stableOpen,
        cueOpen: window.__ddpLastOpen || null,
      };
    })()`
  );

  console.log(JSON.stringify(results, null, 2));
  client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
