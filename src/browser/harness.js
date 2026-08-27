// This function is serialized by Playwright and runs before application scripts.
// Keep it self-contained: imports and outer-scope values are unavailable in-page.
export function installHarness(options = {}) {
  const state = {
    active: options.captureFrames === true && globalThis.top !== globalThis,
    effects: [],
    safe: options.safe !== false,
    snapshots: null,
    truncated: false,
    tools: new Map(),
  };

  const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
  const nativeSetTimeout = globalThis.setTimeout.bind(globalThis);
  const nativeClearTimeout = globalThis.clearTimeout.bind(globalThis);
  const safeClone = (value, depth = 0, seen = new WeakSet(), budget = { remaining: 1_000 }) => {
    if (budget.remaining <= 0) return { truncated: true, reason: "node budget" };
    budget.remaining -= 1;
    if (value === undefined) return null;
    if (value === null || typeof value === "boolean" || typeof value === "number") return value;
    if (typeof value === "string") return value.length > 2_000 ? `${value.slice(0, 1_999)}…` : value;
    if (typeof value === "bigint") return String(value);
    if (typeof value !== "object") return { type: typeof value, preview: String(value).slice(0, 200) };
    if (depth >= 6) return { type: Object.prototype.toString.call(value), truncated: true };
    if (seen.has(value)) return { type: Object.prototype.toString.call(value), circular: true };
    seen.add(value);
    try {
      if (Array.isArray(value)) {
        const result = value.slice(0, 100).map((item) => safeClone(item, depth + 1, seen, budget));
        if (value.length > 100) result.push({ truncatedItems: value.length - 100 });
        return result;
      }
      const result = {};
      let keys = 0;
      for (const key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        if (keys >= 100) {
          result.__truncatedKeys = true;
          break;
        }
        result[key] = safeClone(value[key], depth + 1, seen, budget);
        keys += 1;
      }
      return result;
    } catch {
      return { type: Object.prototype.toString.call(value), preview: String(value).slice(0, 200) };
    } finally {
      seen.delete(value);
    }
  };
  const selectorFor = (node) => {
    if (!node || node.nodeType !== 1) return node?.nodeName?.toLowerCase?.() ?? "document";
    if (node.id) return `#${node.id}`;
    const tag = node.tagName.toLowerCase();
    const classes = [...node.classList].slice(0, 2).map((name) => `.${name}`).join("");
    return `${tag}${classes}`;
  };
  const record = (effect) => {
    if (!state.active) return;
    if (state.effects.length >= 500) {
      if (!state.truncated) {
        state.truncated = true;
        state.effects.push({
          at: performance.now(),
          kind: "capture",
          operation: "effects.truncated",
          target: "500 effect limit",
          blocked: false,
        });
      }
      return;
    }
    state.effects.push({ at: performance.now(), ...safeClone(effect) });
  };
  const requestDetails = (input, init = {}) => {
    try {
      const request = new Request(input, init);
      const url = new URL(request.url, location.href);
      const method = request.method.toUpperCase();
      return {
        kind: "network",
        operation: method,
        method,
        mutating: !safeMethods.has(method),
        target: `${url.pathname}${url.search}`,
        url: url.href,
        crossOrigin: url.origin !== location.origin,
      };
    } catch {
      const method = String(init?.method ?? "GET").toUpperCase();
      return {
        kind: "network",
        operation: method,
        method,
        mutating: !safeMethods.has(method),
        target: String(input),
        url: String(input),
        crossOrigin: false,
      };
    }
  };

  const originalFetch = globalThis.fetch?.bind(globalThis);
  if (originalFetch) {
    globalThis.fetch = async (input, init) => {
      const effect = requestDetails(input, init);
      const blocked = state.safe && effect.mutating;
      record({ ...effect, blocked, source: "fetch" });
      if (blocked) {
        return new Response(JSON.stringify({ blocked: true, by: "effectprint", method: effect.method }), {
          status: 202,
          headers: { "content-type": "application/json", "x-effectprint-blocked": "true" },
        });
      }
      return originalFetch(input, init);
    };
  }

  if (globalThis.XMLHttpRequest) {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
      this.__effectprintRequest = { method, url };
      return originalOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function patchedSend(body) {
      const details = requestDetails(this.__effectprintRequest?.url ?? location.href, {
        method: this.__effectprintRequest?.method ?? "GET",
        body,
      });
      const blocked = state.safe && details.mutating;
      record({ ...details, blocked, source: "xhr" });
      if (blocked) {
        queueMicrotask(() => {
          this.dispatchEvent(new ProgressEvent("error"));
          this.dispatchEvent(new ProgressEvent("loadend"));
        });
        return undefined;
      }
      return originalSend.call(this, body);
    };
  }

  if (navigator.sendBeacon) {
    const originalBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      const effect = requestDetails(url, { method: "POST", body: data });
      const blocked = state.safe;
      record({ ...effect, blocked, source: "beacon" });
      return blocked ? true : originalBeacon(url, data);
    };
  }

  if (globalThis.WebSocket) {
    const originalWebSocketSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function patchedWebSocketSend(data) {
      const blocked = state.safe;
      record({
        kind: "network",
        operation: "websocket.send",
        method: "WEBSOCKET",
        target: this.url,
        url: this.url,
        mutating: true,
        blocked,
        valuePreview: typeof data === "string" ? data.slice(0, 120) : Object.prototype.toString.call(data),
      });
      if (blocked) return undefined;
      return originalWebSocketSend.call(this, data);
    };
  }

  if (globalThis.Storage) {
    for (const operation of ["setItem", "removeItem", "clear"]) {
      const original = Storage.prototype[operation];
      Storage.prototype[operation] = function patchedStorage(...args) {
        const area = this === globalThis.localStorage ? "localStorage" : "sessionStorage";
        const blocked = state.safe;
        record({
          kind: "storage",
          operation: `${area}.${operation}`,
          target: args[0] ?? "*",
          blocked,
          valuePreview: args[1] === undefined ? undefined : String(args[1]).slice(0, 120),
        });
        if (blocked) return undefined;
        return original.apply(this, args);
      };
    }
  }

  if (globalThis.IDBObjectStore) {
    for (const operation of ["add", "put", "delete", "clear"]) {
      const original = IDBObjectStore.prototype[operation];
      if (!original) continue;
      IDBObjectStore.prototype[operation] = function patchedIndexedDb(...args) {
        const blocked = state.safe;
        record({
          kind: "storage",
          operation: `indexedDB.${operation}`,
          target: this.name ?? "object-store",
          blocked,
        });
        if (blocked) throw new DOMException("Blocked by Effectprint safe mode", "SecurityError");
        return original.apply(this, args);
      };
    }
  }

  if (globalThis.IDBCursor) {
    for (const operation of ["update", "delete"]) {
      const original = IDBCursor.prototype[operation];
      if (!original) continue;
      IDBCursor.prototype[operation] = function patchedIndexedDbCursor(...args) {
        const blocked = state.safe;
        record({ kind: "storage", operation: `indexedDB.cursor.${operation}`, target: "cursor", blocked });
        if (blocked) throw new DOMException("Blocked by Effectprint safe mode", "SecurityError");
        return original.apply(this, args);
      };
    }
  }

  if (globalThis.IDBFactory?.prototype?.deleteDatabase) {
    const originalDeleteDatabase = IDBFactory.prototype.deleteDatabase;
    IDBFactory.prototype.deleteDatabase = function patchedDeleteDatabase(name) {
      const blocked = state.safe;
      record({ kind: "storage", operation: "indexedDB.deleteDatabase", target: String(name), blocked });
      if (blocked) throw new DOMException("Blocked by Effectprint safe mode", "SecurityError");
      return originalDeleteDatabase.call(this, name);
    };
  }

  if (globalThis.Cache) {
    for (const operation of ["add", "addAll", "put", "delete"]) {
      const original = Cache.prototype[operation];
      if (!original) continue;
      Cache.prototype[operation] = function patchedCache(...args) {
        const blocked = state.safe;
        record({ kind: "storage", operation: `cache.${operation}`, target: String(args[0] ?? "*"), blocked });
        return blocked ? Promise.resolve(operation === "delete" ? false : undefined) : original.apply(this, args);
      };
    }
  }

  if (globalThis.CacheStorage) {
    const originalDelete = CacheStorage.prototype.delete;
    CacheStorage.prototype.delete = function patchedCacheStorageDelete(name) {
      const blocked = state.safe;
      record({ kind: "storage", operation: "caches.delete", target: String(name), blocked });
      return blocked ? Promise.resolve(false) : originalDelete.call(this, name);
    };
  }

  const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie")
    ?? Object.getOwnPropertyDescriptor(HTMLDocument.prototype, "cookie");
  if (cookieDescriptor?.set && cookieDescriptor?.get) {
    try {
      Object.defineProperty(document, "cookie", {
        configurable: true,
        get: () => cookieDescriptor.get.call(document),
        set: (value) => {
          const blocked = state.safe;
          record({
            kind: "cookie",
            operation: "cookie.set",
            target: String(value).split("=", 1)[0],
            blocked,
            valuePreview: String(value).slice(0, 120),
          });
          if (!blocked) cookieDescriptor.set.call(document, value);
        },
      });
    } catch {
      // Some browser builds do not allow an own cookie descriptor.
    }
  }

  if (globalThis.cookieStore) {
    for (const operation of ["set", "delete"]) {
      const original = globalThis.cookieStore[operation]?.bind(globalThis.cookieStore);
      if (!original) continue;
      try {
        globalThis.cookieStore[operation] = (...args) => {
          const first = args[0];
          const target = typeof first === "string" ? first : first?.name ?? "cookie";
          const blocked = state.safe;
          record({ kind: "cookie", operation: `cookieStore.${operation}`, target, blocked });
          return blocked ? Promise.resolve() : original(...args);
        };
      } catch {
        // Cookie Store methods can be read-only in some browser builds.
      }
    }
  }

  for (const operation of ["pushState", "replaceState"]) {
    const original = history[operation].bind(history);
    history[operation] = (stateValue, title, url) => {
      const target = url ? new URL(url, location.href).href : location.href;
      const blocked = state.safe;
      record({ kind: "navigation", operation: `history.${operation}`, target, blocked });
      return blocked ? undefined : original(stateValue, title, url);
    };
  }

  const originalOpenWindow = globalThis.open?.bind(globalThis);
  if (originalOpenWindow) {
    globalThis.open = (url, ...args) => {
      const target = new URL(url ?? "", location.href).href;
      const blocked = state.safe;
      record({ kind: "navigation", operation: "window.open", target, blocked });
      return blocked ? null : originalOpenWindow(url, ...args);
    };
  }

  const recordForm = (form, operation) => {
    const method = String(form.method || "GET").toUpperCase();
    const target = new URL(form.action || location.href, location.href).href;
    const blocked = state.safe;
    record({ kind: "form", operation, method, target, url: target, mutating: method !== "GET", blocked });
    return blocked;
  };
  document.addEventListener("submit", (event) => {
    if (recordForm(event.target, "form.submit-event")) event.preventDefault();
  }, true);
  if (globalThis.HTMLFormElement) {
    for (const operation of ["submit", "requestSubmit"]) {
      const original = HTMLFormElement.prototype[operation];
      if (!original) continue;
      HTMLFormElement.prototype[operation] = function patchedSubmit(...args) {
        if (recordForm(this, `form.${operation}`)) return undefined;
        return original.apply(this, args);
      };
    }
  }

  document.addEventListener("click", (event) => {
    const anchor = event.target?.closest?.("a[href]");
    if (!anchor) return;
    const target = new URL(anchor.href, location.href).href;
    const blocked = state.safe;
    record({
      kind: anchor.hasAttribute("download") ? "download" : "navigation",
      operation: anchor.hasAttribute("download") ? "anchor.download" : "anchor.click",
      target,
      blocked,
    });
    if (blocked) event.preventDefault();
  }, true);

  if (navigator.clipboard) {
    for (const operation of ["write", "writeText"]) {
      const original = navigator.clipboard[operation]?.bind(navigator.clipboard);
      if (!original) continue;
      try {
        navigator.clipboard[operation] = (...args) => {
          const blocked = state.safe;
          record({ kind: "clipboard", operation: `clipboard.${operation}`, target: "system clipboard", blocked });
          return blocked ? Promise.resolve() : original(...args);
        };
      } catch {
        // Clipboard methods can be read-only in some browser builds.
      }
    }
  }

  const observer = new MutationObserver((records) => {
    if (!state.active) return;
    const summary = new Map();
    for (const mutation of records) {
      const target = selectorFor(mutation.target);
      const current = summary.get(target) ?? { added: 0, attributes: 0, removed: 0, text: 0 };
      current.added += mutation.addedNodes?.length ?? 0;
      current.removed += mutation.removedNodes?.length ?? 0;
      current.attributes += mutation.type === "attributes" ? 1 : 0;
      current.text += mutation.type === "characterData" ? 1 : 0;
      summary.set(target, current);
    }
    for (const [target, details] of summary) {
      record({ kind: "dom", operation: "dom.mutate", target, blocked: false, details });
    }
  });
  const beginObserve = () => {
    if (document.documentElement) {
      observer.observe(document.documentElement, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      });
    }
  };
  if (document.documentElement) beginObserve();
  else document.addEventListener("DOMContentLoaded", beginObserve, { once: true });

  const captureTool = (tool) => {
    if (!tool || typeof tool.name !== "string") throw new TypeError("WebMCP tool must have a name");
    if (!tool.name.length || tool.name.length > 256) throw new TypeError("WebMCP tool names must contain 1 to 256 characters");
    if (!state.tools.has(tool.name) && state.tools.size >= 200) {
      throw new Error("Effectprint tool registration limit reached (200)");
    }
    state.tools.set(tool.name, tool);
  };
  const shim = {
    async registerTool(tool, registrationOptions = {}) {
      captureTool(tool);
      registrationOptions.signal?.addEventListener?.("abort", () => state.tools.delete(tool.name), { once: true });
    },
    async unregisterTool(name) {
      state.tools.delete(typeof name === "string" ? name : name?.name);
    },
    async getTools() {
      return [...state.tools.values()].map((tool) => ({
        name: tool.name,
        title: tool.title == null ? null : String(tool.title).slice(0, 500),
        description: String(tool.description ?? "").slice(0, 2_000),
        inputSchema: safeClone(tool.inputSchema ?? { type: "object", properties: {} }),
        annotations: safeClone(tool.annotations ?? {}),
      }));
    },
  };

  const attachModelContext = (owner, property) => {
    let native;
    try {
      native = owner[property];
    } catch {
      native = null;
    }
    if (native?.registerTool) {
      try {
        const originalRegister = native.registerTool.bind(native);
        native.registerTool = async (tool, registrationOptions) => {
          captureTool(tool);
          return originalRegister(tool, registrationOptions);
        };
        return native;
      } catch {
        // Fall through and attempt to expose the capture shim.
      }
    }
    try {
      Object.defineProperty(owner, property, { configurable: true, value: shim });
      return shim;
    } catch {
      return native;
    }
  };

  attachModelContext(document, "modelContext");
  attachModelContext(navigator, "modelContext");

  const snapshotArea = (area) => {
    try {
      const result = {};
      for (let index = 0; index < Math.min(area.length, 200); index += 1) {
        const key = area.key(index);
        if (key !== null) result[key] = String(area.getItem(key)).slice(0, 200);
      }
      return result;
    } catch {
      return {};
    }
  };
  const takeSnapshots = () => ({
    cookie: (() => { try { return document.cookie; } catch { return ""; } })(),
    localStorage: (() => { try { return snapshotArea(globalThis.localStorage); } catch { return {}; } })(),
    sessionStorage: (() => { try { return snapshotArea(globalThis.sessionStorage); } catch { return {}; } })(),
  });
  const detectSnapshotChanges = () => {
    if (!state.snapshots) return;
    const after = takeSnapshots();
    for (const area of ["localStorage", "sessionStorage"]) {
      const beforeValues = state.snapshots[area];
      const afterValues = after[area];
      for (const key of new Set([...Object.keys(beforeValues), ...Object.keys(afterValues)])) {
        if (beforeValues[key] !== afterValues[key]) {
          record({
            kind: "storage",
            operation: `${area}.snapshot-change`,
            target: key,
            blocked: false,
            source: "post-execution-snapshot",
          });
        }
      }
    }
    if (state.snapshots.cookie !== after.cookie) {
      record({
        kind: "cookie",
        operation: "cookie.snapshot-change",
        target: "document cookies",
        blocked: false,
        source: "post-execution-snapshot",
      });
    }
  };
  const beginCapture = () => {
    state.effects = [];
    state.truncated = false;
    state.snapshots = takeSnapshots();
    state.active = true;
  };
  const endCapture = () => {
    detectSnapshotChanges();
    const effects = safeClone(state.effects);
    state.active = false;
    state.snapshots = null;
    return effects;
  };

  const api = Object.freeze({
    async listTools() {
      return shim.getTools();
    },
    beginCapture,
    endCapture,
    getEffects() {
      return safeClone(state.effects);
    },
    async execute(name, input, executionOptions = {}) {
      const tool = state.tools.get(name);
      if (!tool) throw new Error(`Tool not found: ${name}`);
      if (typeof tool.execute !== "function") throw new Error(`Tool has no imperative execute handler: ${name}`);
      beginCapture();
      const started = performance.now();
      const controller = new AbortController();
      const timeoutMs = Number(executionOptions.timeoutMs ?? 5000);
      const deferEnd = executionOptions.deferEnd === true;
      let timer;
      try {
        const timeout = new Promise((_, reject) => {
          timer = nativeSetTimeout(() => {
            controller.abort(new DOMException("Effectprint timeout", "TimeoutError"));
            const error = new Error(`Timed out after ${timeoutMs}ms`);
            error.name = "TimeoutError";
            reject(error);
          }, timeoutMs);
        });
        const result = await Promise.race([
          Promise.resolve(tool.execute(input, { signal: controller.signal })),
          timeout,
        ]);
        if (!deferEnd) {
          await new Promise((resolve) => nativeSetTimeout(resolve, Number(executionOptions.settleMs ?? 150)));
        }
        return {
          durationMs: Math.round((performance.now() - started) * 100) / 100,
          effects: deferEnd ? [] : endCapture(),
          output: safeClone(result),
        };
      } catch (error) {
        return {
          durationMs: Math.round((performance.now() - started) * 100) / 100,
          effects: deferEnd ? [] : endCapture(),
          error: {
            message: String(error?.message ?? error).slice(0, 2_000),
            name: String(error?.name ?? "Error").slice(0, 200),
          },
        };
      } finally {
        nativeClearTimeout(timer);
        if (!deferEnd) state.active = false;
      }
    },
  });
  try {
    Object.defineProperty(globalThis, "__effectprint", {
      configurable: false,
      enumerable: false,
      value: api,
      writable: false,
    });
  } catch {
    try {
      globalThis.__effectprint = api;
    } catch {
      // An incompatible pre-existing non-configurable property prevents instrumentation.
    }
  }
}
