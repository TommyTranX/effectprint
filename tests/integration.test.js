import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { auditUrl, discoverUrl } from "../src/browser/audit.js";
import { DEMO_CONFIG, startPoisonedShop } from "../src/demo.js";

async function startStartupWriteFixture() {
  const state = { writes: 0 };
  const server = createServer((request, response) => {
    if (request.method === "POST") {
      state.writes += 1;
      response.writeHead(204).end();
      return;
    }
    response.writeHead(200, { "content-type": "text/html" });
    response.end(`<!doctype html><script type="module">
      await fetch('/api/startup', { method: 'POST' });
      await document.modelContext.registerTool({
        name: 'read_status',
        description: 'Read status without changing state.',
        inputSchema: { type: 'object', properties: {} },
        annotations: { readOnlyHint: true },
        execute: async () => ({ status: 'ok' })
      });
    </script>`);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    state,
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function startHtmlFixture(html, handler) {
  const server = createServer((request, response) => {
    if (handler?.(request, response) === true) return;
    response.writeHead(200, { "content-type": "text/html" });
    response.end(html);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test("poisoned read-only tool is caught and its checkout is blocked", {
  skip: process.env.EFFECTPRINT_INTEGRATION !== "1",
  timeout: 30_000,
}, async () => {
  const fixture = await startPoisonedShop();
  try {
    const report = await auditUrl(fixture.url, DEMO_CONFIG, {
      browser: process.env.EFFECTPRINT_BROWSER ?? "chrome",
      safe: true,
    });
    assert.equal(report.passed, false);
    assert.equal(report.summary.discovered, 1);
    assert.equal(report.tools[0].tool, "search_products");
    assert.ok(report.tools[0].violations.some((item) => item.code === "READ_ONLY_MUTATION"));
    assert.ok(report.tools[0].effects.some((effect) => effect.method === "POST" && effect.blocked));
    assert.equal(fixture.state.checkoutAttempts, 0);
    assert.equal(fixture.state.completedPurchases, 0);
  } finally {
    await fixture.close();
  }
});

test("safe mode blocks mutating page-load traffic before tool execution", {
  skip: process.env.EFFECTPRINT_INTEGRATION !== "1",
  timeout: 30_000,
}, async () => {
  const fixture = await startStartupWriteFixture();
  try {
    const report = await auditUrl(fixture.url, { version: 1, tools: {} }, {
      browser: process.env.EFFECTPRINT_BROWSER ?? "chrome",
      safe: true,
    });
    assert.equal(report.passed, true);
    assert.equal(report.summary.passed, 1);
    assert.equal(fixture.state.writes, 0);
  } finally {
    await fixture.close();
  }
});

test("list mode observes registration without blocking bootstrap traffic", {
  skip: process.env.EFFECTPRINT_INTEGRATION !== "1",
  timeout: 30_000,
}, async () => {
  const fixture = await startStartupWriteFixture();
  try {
    const tools = await discoverUrl(fixture.url, { browser: process.env.EFFECTPRINT_BROWSER ?? "chrome" });
    assert.equal(tools[0].name, "read_status");
    assert.equal(fixture.state.writes, 1);
  } finally {
    await fixture.close();
  }
});

test("a synchronous infinite loop is stopped by the Node watchdog", {
  skip: process.env.EFFECTPRINT_INTEGRATION !== "1",
  timeout: 15_000,
}, async () => {
  const fixture = await startHtmlFixture(`<!doctype html><script type="module">
    await document.modelContext.registerTool({
      name: 'freeze_renderer',
      description: 'Fixture that never yields.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => { while (true) {} }
    });
  </script>`);
  try {
    const started = Date.now();
    const report = await auditUrl(fixture.url, { version: 1, tools: {} }, {
      browser: process.env.EFFECTPRINT_BROWSER ?? "chrome",
      timeoutMs: 300,
    });
    assert.ok(Date.now() - started < 5_000);
    assert.equal(report.passed, false);
    assert.ok(report.tools[0].violations.some((item) => item.code === "EXECUTION_TIMEOUT"));
  } finally {
    await fixture.close();
  }
});

test("localhost redirects cannot bypass the remote target gate", {
  skip: process.env.EFFECTPRINT_INTEGRATION !== "1",
  timeout: 30_000,
}, async () => {
  const fixture = await startHtmlFixture("", (request, response) => {
    response.writeHead(302, { location: "https://example.invalid/" });
    response.end();
    return true;
  });
  try {
    await assert.rejects(
      () => auditUrl(fixture.url, { version: 1, tools: {} }, { browser: process.env.EFFECTPRINT_BROWSER ?? "chrome" }),
      /Blocked non-local redirect or navigation/,
    );
    await assert.rejects(
      () => discoverUrl(fixture.url, { browser: process.env.EFFECTPRINT_BROWSER ?? "chrome" }),
      /Blocked non-local redirect or navigation/,
    );
  } finally {
    await fixture.close();
  }
});

test("explicit null input is preserved and missing contracts fail closed", {
  skip: process.env.EFFECTPRINT_INTEGRATION !== "1",
  timeout: 30_000,
}, async () => {
  const fixture = await startHtmlFixture(`<!doctype html><script type="module">
    await document.modelContext.registerTool({
      name: 'alpha',
      description: 'Echo whether input is null.',
      inputSchema: { type: 'object', properties: {} },
      annotations: { readOnlyHint: true },
      execute: (input) => ({ receivedNull: input === null })
    });
  </script>`);
  try {
    const report = await auditUrl(fixture.url, {
      version: 1,
      tools: { alpha: { input: null }, missing: { input: {} } },
    }, {
      browser: process.env.EFFECTPRINT_BROWSER ?? "chrome",
      includeValues: true,
    });
    assert.deepEqual(report.tools[0].input, null);
    assert.deepEqual(report.tools[0].output, { receivedNull: true });
    assert.ok(report.diagnostics.some((item) => item.code === "TOOL_NOT_FOUND" && item.tool === "missing"));
    assert.equal(report.passed, false);
  } finally {
    await fixture.close();
  }
});

test("each tool executes in a fresh page context", {
  skip: process.env.EFFECTPRINT_INTEGRATION !== "1",
  timeout: 30_000,
}, async () => {
  const fixture = await startHtmlFixture(`<!doctype html><script type="module">
    await document.modelContext.registerTool({
      name: 'first', description: 'Set transient page state.',
      inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true },
      execute: () => { globalThis.__fixtureLeak = true; return { done: true }; }
    });
    await document.modelContext.registerTool({
      name: 'second', description: 'Read transient page state.',
      inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true },
      execute: () => ({ leaked: globalThis.__fixtureLeak === true })
    });
    await document.modelContext.registerTool({
      name: 'write_tool', description: 'A write-capable tool that needs an explicit decision.',
      inputSchema: { type: 'object', properties: {} }, annotations: {},
      execute: () => ({ done: true })
    });
  </script>`);
  try {
    const report = await auditUrl(fixture.url, { version: 1, tools: {} }, {
      browser: process.env.EFFECTPRINT_BROWSER ?? "chrome",
      includeValues: true,
    });
    assert.equal(report.tools.find((tool) => tool.tool === "second").output.leaked, false);
    assert.ok(report.diagnostics.some((item) => item.code === "TOOL_NOT_AUDITED" && item.tool === "write_tool"));
    assert.equal(report.passed, false);
  } finally {
    await fixture.close();
  }
});

test("context and frame instrumentation capture resource GETs, response cookies, and iframe storage", {
  skip: process.env.EFFECTPRINT_INTEGRATION !== "1",
  timeout: 30_000,
}, async () => {
  const fixture = await startHtmlFixture(`<!doctype html><iframe src="/frame"></iframe><script type="module">
    await document.modelContext.registerTool({
      name: 'multi_realm', description: 'Exercise capture layers.',
      inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true },
      execute: async () => {
        const image = new Image();
        image.src = '/pixel?marker=private-fixture';
        document.body.append(image);
        await fetch('/cookie?marker=private-fixture');
        const frame = document.querySelector('iframe');
        frame.contentWindow.localStorage.setItem('fixture_key', 'private-fixture-value');
        return { done: true };
      }
    });
  </script>`, (request, response) => {
    const path = new URL(request.url, "http://127.0.0.1").pathname;
    if (path === "/pixel") {
      response.writeHead(204).end();
      return true;
    }
    if (path === "/cookie") {
      response.writeHead(204, { "set-cookie": "fixture_session=fixture-value; HttpOnly; SameSite=Strict" }).end();
      return true;
    }
    if (path === "/frame") {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<!doctype html><p>child</p>");
      return true;
    }
    return false;
  });
  try {
    const report = await auditUrl(fixture.url, { version: 1, tools: {} }, {
      browser: process.env.EFFECTPRINT_BROWSER ?? "chrome",
    });
    const result = report.tools[0];
    assert.ok(result.effects.some((effect) => effect.kind === "network" && effect.target.startsWith("/pixel?")));
    assert.ok(result.effects.some((effect) => effect.operation === "response.set-cookie"));
    assert.ok(
      result.effects.some((effect) => effect.kind === "storage" && effect.blocked),
      JSON.stringify(result.effects),
    );
    assert.ok(result.violations.some((item) => item.code === "READ_ONLY_MUTATION"));
    assert.doesNotMatch(JSON.stringify(report), /private-fixture|fixture-value/);
  } finally {
    await fixture.close();
  }
});
