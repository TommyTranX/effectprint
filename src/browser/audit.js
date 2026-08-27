import { chromium } from "playwright-core";
import { DEFAULT_OPTIONS, WEBMCP_SNAPSHOT } from "../constants.js";
import { verifyEffects } from "../contracts.js";
import { synthesizeInput } from "../synthesize.js";
import {
  hash,
  isLocalUrl,
  isMutatingHttpMethod,
  nowIso,
  redactUrl,
  stableStringify,
} from "../utils.js";
import { installHarness } from "./harness.js";

const MAX_EXTERNAL_EFFECTS = 1_000;
const MAX_EFFECT_TEXT = 4_000;

function limitText(value, length = MAX_EFFECT_TEXT) {
  const text = String(value ?? "");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function assertHttpTarget(rawUrl, allowRemote) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid audit URL: ${rawUrl}`);
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error("Effectprint accepts only HTTP(S) targets.");
  }
  if (!isLocalUrl(parsed.href) && allowRemote !== true) {
    throw new Error("Remote targets are disabled. Use --allow-remote for a site you are authorized to inspect.");
  }
  return parsed;
}

function normalizeUrlForFingerprint(value, targetUrl) {
  if (typeof value !== "string" || !targetUrl) return value;
  if (!/^(?:https?:|wss?:|\/)/i.test(value)) return value;
  try {
    const target = new URL(targetUrl);
    const parsed = new URL(value, target);
    if (parsed.origin === target.origin) return `<target-origin>${parsed.pathname}${parsed.search}${parsed.hash}`;
    return parsed.href;
  } catch {
    return value;
  }
}

function normalizeEffect(effect, targetUrl) {
  const normalized = { ...effect };
  delete normalized.at;
  if (normalized.url) normalized.url = normalizeUrlForFingerprint(normalized.url, targetUrl);
  if (normalized.target) normalized.target = normalizeUrlForFingerprint(normalized.target, targetUrl);
  return normalized;
}

export function deduplicateEffects(effects) {
  const grouped = new Map();
  for (const rawEffect of effects) {
    const effect = normalizeEffect(rawEffect);
    const occurrenceCount = Number.isSafeInteger(effect.count) && effect.count > 0 ? effect.count : 1;
    delete effect.count;
    const key = stableStringify(effect);
    const existing = grouped.get(key);
    if (existing) {
      existing.count = (existing.count ?? 1) + occurrenceCount;
      continue;
    }
    grouped.set(key, occurrenceCount > 1 ? { ...effect, count: occurrenceCount } : effect);
  }
  return [...grouped.values()];
}

export function fingerprintEffects(effects, targetUrl) {
  const canonical = deduplicateEffects(effects)
    .map((effect) => normalizeEffect(effect, targetUrl))
    .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)));
  return hash(canonical);
}

function mergeOptions(options) {
  const defined = Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));
  return { ...DEFAULT_OPTIONS, ...defined };
}

function targetForRequest(rawUrl, pageUrl) {
  try {
    const requestUrl = new URL(rawUrl);
    const pageOrigin = new URL(pageUrl).origin;
    return limitText(requestUrl.origin === pageOrigin
      ? `${requestUrl.pathname}${requestUrl.search}`
      : requestUrl.href);
  } catch {
    return limitText(rawUrl);
  }
}

function redactEffect(effect, includeValues) {
  if (includeValues) return effect;
  const result = { ...effect };
  delete result.valuePreview;
  for (const field of ["target", "url"]) {
    const value = result[field];
    if (typeof value === "string" && (value.includes("?") || /^(?:https?:)/i.test(value))) {
      result[field] = redactUrl(value);
    }
  }
  return result;
}

function redactMessage(message, includeValues) {
  if (includeValues) return message;
  return String(message).replace(/https?:\/\/[^\s)]+|\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+\?[^\s)]+/g, (value) => redactUrl(value));
}

function publicViolation(violation, includeValues) {
  let matcher = violation.matcher;
  if (!includeValues && matcher && typeof matcher === "object") {
    matcher = { ...matcher };
    for (const field of ["target", "url"]) {
      if (typeof matcher[field] === "string" && matcher[field].includes("?")) {
        matcher[field] = redactUrl(matcher[field]);
      }
    }
  }
  return {
    ...violation,
    message: redactMessage(violation.message, includeValues),
    ...(violation.effect ? { effect: redactEffect(violation.effect, includeValues) } : {}),
    ...(violation.matcher ? { matcher } : {}),
  };
}

function effectCount(effects) {
  return effects.reduce((sum, effect) => sum + (effect.count ?? 1), 0);
}

export async function launchAuditBrowser(options = {}) {
  const browserName = options.browser ?? DEFAULT_OPTIONS.browser;
  const launchOptions = { headless: options.headed !== true };
  if (browserName !== "chromium") launchOptions.channel = browserName;
  try {
    return await chromium.launch(launchOptions);
  } catch (error) {
    const hint = browserName === "chromium"
      ? "Install Chromium with `npx playwright-core install chromium`, or use `--browser chrome`."
      : `Install the ${browserName} browser, or use \`--browser chromium\` after installing Playwright Chromium.`;
    throw new Error(`Could not launch ${browserName}. ${hint}\n${error.message}`);
  }
}

async function createSession(browser, targetUrl, settings, { guardMutations }) {
  const initialTarget = new URL(targetUrl);
  const context = await browser.newContext({ serviceWorkers: "block" });
  let activeTool = null;
  let blockedNavigation = null;
  let page;
  const externalEffects = [];
  const pendingEffects = [];

  const pushExternal = (effect) => {
    if (!activeTool) return;
    if (externalEffects.length >= MAX_EXTERNAL_EFFECTS) {
      if (!externalEffects.some((item) => item.operation === "external-effects.truncated")) {
        externalEffects.push({
          kind: "capture",
          operation: "external-effects.truncated",
          target: `${MAX_EXTERNAL_EFFECTS} effect limit`,
          blocked: false,
          source: "playwright-context",
        });
      }
      return;
    }
    externalEffects.push(effect);
  };

  await context.addInitScript(installHarness, {
    captureFrames: guardMutations,
    safe: guardMutations && settings.safe === true,
  });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const rawUrl = limitText(request.url());
    const method = request.method().toUpperCase();
    const navigation = request.isNavigationRequest();
    const mutating = isMutatingHttpMethod(method);
    const pageUrl = page?.url() && page.url() !== "about:blank" ? page.url() : initialTarget.href;
    let crossOrigin = false;
    try {
      crossOrigin = new URL(rawUrl).origin !== new URL(pageUrl).origin;
    } catch {
      crossOrigin = false;
    }
    const target = targetForRequest(rawUrl, pageUrl);
    const effect = navigation
      ? {
          kind: "navigation",
          operation: "page.navigate",
          method,
          target,
          url: rawUrl,
          mutating: true,
          crossOrigin,
          blocked: false,
          source: "playwright-context",
        }
      : {
          kind: "network",
          operation: method,
          method,
          target,
          url: rawUrl,
          mutating,
          crossOrigin,
          blocked: false,
          source: "playwright-context",
        };

    let navigationAuthorized = true;
    if (navigation) {
      try {
        navigationAuthorized = settings.allowRemote === true
          ? new URL(rawUrl).origin === initialTarget.origin
          : isLocalUrl(rawUrl);
      } catch {
        navigationAuthorized = false;
      }
    }
    if (navigation && !navigationAuthorized) {
      blockedNavigation = {
        reason: settings.allowRemote === true ? "cross-origin" : "non-local",
        url: rawUrl,
      };
      pushExternal({ ...effect, blocked: true });
      return route.abort("blockedbyclient");
    }

    const guarded = guardMutations && settings.safe === true;
    const blockNavigation = guarded && activeTool && navigation;
    const blockMutation = guarded && mutating;
    const blockCrossOrigin = guarded && activeTool && crossOrigin;
    const shouldBlock = blockNavigation || blockMutation || blockCrossOrigin;

    if (activeTool) {
      const resourceType = request.resourceType();
      const capturedInPage = resourceType === "fetch" || resourceType === "xhr";
      if (shouldBlock || !capturedInPage) pushExternal({ ...effect, blocked: shouldBlock });
    }
    if (shouldBlock) return route.abort("blockedbyclient");

    if (navigation) {
      const response = await route.fetch({ maxRedirects: 0 });
      const location = response.headers().location;
      if (location && response.status() >= 300 && response.status() < 400) {
        const destination = new URL(location, rawUrl).href;
        const destinationAuthorized = settings.allowRemote === true
          ? new URL(destination).origin === initialTarget.origin
          : isLocalUrl(destination);
        if (!destinationAuthorized) {
          blockedNavigation = {
            reason: settings.allowRemote === true ? "cross-origin" : "non-local",
            url: destination,
          };
          pushExternal({ ...effect, target: destination, url: destination, crossOrigin: true, blocked: true });
          return route.abort("blockedbyclient");
        }
      }
      return route.fulfill({ response });
    }
    return route.continue();
  });

  await context.routeWebSocket("**/*", async (webSocket) => {
    const rawUrl = limitText(webSocket.url());
    let crossOrigin = true;
    try {
      const socketUrl = new URL(rawUrl);
      const pageOrigin = new URL(page?.url() || initialTarget.href);
      crossOrigin = socketUrl.hostname !== pageOrigin.hostname || socketUrl.port !== pageOrigin.port;
    } catch {
      crossOrigin = true;
    }
    const blocked = guardMutations && settings.safe === true;
    pushExternal({
      kind: "network",
      operation: "websocket.connect",
      method: "WEBSOCKET",
      target: rawUrl,
      url: rawUrl,
      mutating: true,
      crossOrigin,
      blocked,
      source: "playwright-websocket-route",
    });
    if (blocked) await webSocket.close({ code: 1008, reason: "Blocked by Effectprint safe mode" });
    else webSocket.connectToServer();
  });

  context.on("page", (candidate) => {
    if (!page || candidate === page) return;
    pushExternal({
      kind: "navigation",
      operation: "popup.open",
      target: limitText(candidate.url() || "about:blank"),
      mutating: true,
      blocked: guardMutations && settings.safe === true,
      source: "playwright-context",
    });
    if (guardMutations && settings.safe === true) void candidate.close({ runBeforeUnload: false }).catch(() => {});
  });

  context.on("response", (response) => {
    if (!activeTool) return;
    const pending = response.headerValues("set-cookie").then((values) => {
      if (!values.length || !activeTool) return;
      pushExternal({
        kind: "cookie",
        operation: "response.set-cookie",
        target: limitText(response.url()),
        blocked: false,
        isolated: true,
        count: values.length,
        source: "playwright-response",
      });
    }).catch(() => {});
    pendingEffects.push(pending);
  });

  page = await context.newPage();

  const navigate = async () => {
    try {
      await page.goto(targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: settings.navigationTimeoutMs,
      });
    } catch (error) {
      if (blockedNavigation) {
        throw new Error(`Blocked ${blockedNavigation.reason} redirect or navigation to ${blockedNavigation.url}. Audit the final origin explicitly if it is authorized.`);
      }
      throw error;
    }
    const finalAuthorized = settings.allowRemote === true
      ? new URL(page.url()).origin === initialTarget.origin
      : isLocalUrl(page.url());
    if (!finalAuthorized) {
      throw new Error(`Blocked unauthorized final URL: ${page.url()}`);
    }
    await page.waitForTimeout(200);
  };

  return {
    context,
    page,
    externalEffects,
    pendingEffects,
    navigate,
    setActiveTool(value) {
      activeTool = value;
      if (value) {
        externalEffects.length = 0;
        pendingEffects.length = 0;
      }
    },
  };
}

async function closeSession(session) {
  await session.context.close().catch(() => {});
}

async function listSessionTools(session) {
  return session.page.evaluate(() => globalThis.__effectprint?.listTools?.() ?? []);
}

export async function discoverUrl(url, options = {}) {
  const settings = mergeOptions(options);
  assertHttpTarget(url, settings.allowRemote);
  const browser = options.browserInstance ?? await launchAuditBrowser(settings);
  const ownsBrowser = !options.browserInstance;
  const session = await createSession(browser, url, settings, { guardMutations: false });
  try {
    await session.navigate();
    return await listSessionTools(session);
  } finally {
    await closeSession(session);
    if (ownsBrowser) await browser.close();
  }
}

function shouldExecute(tool, contract, selectedNames) {
  if (selectedNames?.length && !selectedNames.includes(tool.name)) return { execute: false, reason: "not selected" };
  if (contract?.skip === true) return { execute: false, reason: "disabled by contract" };
  if (tool.annotations?.readOnlyHint === true) return { execute: true };
  if (contract?.execute === true) return { execute: true };
  return {
    execute: false,
    reason: "write-capable or unannotated tool requires tools.<name>.execute: true",
  };
}

function resultBase(tool) {
  return {
    tool: tool.name,
    title: tool.title,
    description: tool.description,
    annotations: tool.annotations,
  };
}

async function executeInFreshSession(browser, url, tool, input, settings) {
  const session = await createSession(browser, url, settings, { guardMutations: true });
  let timedOut = false;
  try {
    await session.navigate();
    const currentTools = await listSessionTools(session);
    if (!currentTools.some((candidate) => candidate.name === tool.name)) {
      return {
        execution: {
          error: { name: "ToolNotFoundError", message: `Tool disappeared before isolated execution: ${tool.name}` },
          effects: [],
        },
        effects: [],
      };
    }

    session.setActiveTool(tool.name);
    await Promise.all(session.page.frames()
      .filter((frame) => frame !== session.page.mainFrame())
      .map((frame) => frame.evaluate(() => globalThis.__effectprint?.beginCapture?.()).catch(() => {})));

    let timer;
    const evaluation = session.page.evaluate(
      ({ name, inputValue, timeoutMs }) => globalThis.__effectprint.execute(
        name,
        inputValue,
        { deferEnd: true, timeoutMs },
      ),
      { name: tool.name, inputValue: input, timeoutMs: settings.timeoutMs },
    ).then(
      (value) => ({ type: "completed", value }),
      (error) => ({ type: "protocol-error", error }),
    );
    const watchdog = new Promise((resolve) => {
      timer = setTimeout(() => resolve({ type: "hard-timeout" }), settings.timeoutMs + 250);
    });
    const outcome = await Promise.race([evaluation, watchdog]);
    clearTimeout(timer);

    if (outcome.type === "hard-timeout") {
      timedOut = true;
      const effects = deduplicateEffects(session.externalEffects);
      session.setActiveTool(null);
      await Promise.race([
        closeSession(session),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
      return {
        execution: {
          error: { name: "TimeoutError", message: `Hard timeout after ${settings.timeoutMs}ms` },
          hardTimeout: true,
          effects: [],
        },
        effects,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, settings.settleMs));
    let mainEffects = [];
    try {
      mainEffects = await session.page.evaluate(() => globalThis.__effectprint?.endCapture?.() ?? []);
    } catch {
      // The page may have detached after a failed execution.
    }
    const childEffects = [];
    await Promise.allSettled(session.pendingEffects);
    for (const frame of session.page.frames()) {
      if (frame === session.page.mainFrame()) continue;
      try {
        childEffects.push(...await frame.evaluate(() => globalThis.__effectprint?.endCapture?.() ?? []));
      } catch {
        // Detached and cross-process frames may disappear during the settle window.
      }
    }
    const execution = outcome.type === "completed"
      ? outcome.value
      : {
          error: {
            name: outcome.error?.name ?? "Error",
            message: outcome.error?.message ?? String(outcome.error),
          },
          effects: [],
        };
    const effects = deduplicateEffects([
      ...mainEffects,
      ...(execution.effects ?? []),
      ...childEffects,
      ...session.externalEffects,
    ]);
    session.setActiveTool(null);
    return { execution, effects };
  } finally {
    if (!timedOut) await closeSession(session);
  }
}

export async function auditUrl(url, config = {}, options = {}) {
  const settings = mergeOptions(options);
  assertHttpTarget(url, settings.allowRemote);
  const browser = options.browserInstance ?? await launchAuditBrowser(settings);
  const ownsBrowser = !options.browserInstance;

  try {
    const discoverySession = await createSession(browser, url, settings, { guardMutations: true });
    let tools;
    try {
      await discoverySession.navigate();
      tools = await listSessionTools(discoverySession);
    } finally {
      await closeSession(discoverySession);
    }

    const diagnostics = [];
    const discoveredNames = new Set(tools.map((tool) => tool.name));
    const expectedNames = new Set([
      ...Object.entries(config.tools ?? {})
        .filter(([, contract]) => contract.skip !== true)
        .map(([name]) => name),
      ...(settings.toolNames ?? []),
    ]);
    for (const name of expectedNames) {
      if (!discoveredNames.has(name)) {
        diagnostics.push({
          code: "TOOL_NOT_FOUND",
          message: `Expected tool was not registered: ${name}`,
          tool: name,
        });
      }
    }

    const results = [];
    for (const tool of tools) {
      const contract = config.tools?.[tool.name] ?? {};
      const decision = shouldExecute(tool, contract, settings.toolNames);
      if (!decision.execute) {
        results.push({
          ...resultBase(tool),
          status: "skipped",
          reason: decision.reason,
          effects: [],
          violations: [],
        });
        if (decision.reason.startsWith("write-capable")) {
          diagnostics.push({
            code: "TOOL_NOT_AUDITED",
            message: `Tool was not audited because it is write-capable or unannotated: ${tool.name}. Set execute: true or skip: true explicitly.`,
            tool: tool.name,
          });
        }
        continue;
      }

      let input;
      try {
        input = Object.hasOwn(contract, "input") ? contract.input : synthesizeInput(tool.inputSchema);
      } catch (error) {
        results.push({
          ...resultBase(tool),
          status: "error",
          error: `Input synthesis failed: ${error.message}`,
          effects: [],
          violations: [{ code: "INPUT_SYNTHESIS_FAILED", message: error.message }],
        });
        continue;
      }

      const { execution, effects: capturedEffects } = await executeInFreshSession(browser, url, tool, input, settings);
      const verification = verifyEffects(tool, capturedEffects, contract);
      const violations = [...verification.violations];
      if (capturedEffects.some((effect) => effect.kind === "capture" && effect.operation?.includes("truncated"))) {
        violations.push({
          code: "EFFECT_CAPTURE_TRUNCATED",
          message: "The effect capture limit was reached; the contract result is incomplete.",
        });
      }
      if (execution.error) {
        const timeout = execution.hardTimeout
          || execution.error.name === "TimeoutError"
          || /timed out|timeout/i.test(execution.error.message);
        violations.push({
          code: timeout ? "EXECUTION_TIMEOUT" : "EXECUTION_FAILED",
          message: `${execution.error.name}: ${execution.error.message}`,
        });
      }

      const publicEffects = capturedEffects.map((effect) => redactEffect(effect, settings.includeValues));
      const publicViolations = violations.map((violation) => publicViolation(violation, settings.includeValues));
      results.push({
        ...resultBase(tool),
        ...(settings.includeValues ? { input, output: execution.output } : {}),
        durationMs: execution.durationMs,
        effectFingerprint: fingerprintEffects(capturedEffects, url),
        effects: publicEffects,
        violations: publicViolations,
        status: publicViolations.length ? "failed" : "passed",
      });
    }

    if (!results.some((result) => result.status !== "skipped")) {
      diagnostics.push({
        code: "NO_TOOLS_AUDITED",
        message: tools.length
          ? "Tools were discovered, but none was eligible for execution."
          : "No imperative WebMCP tools were discovered.",
      });
    }

    const summary = {
      discovered: tools.length,
      passed: results.filter((result) => result.status === "passed").length,
      failed: results.filter((result) => result.status === "failed" || result.status === "error").length,
      skipped: results.filter((result) => result.status === "skipped").length,
      diagnostics: diagnostics.length,
      effects: results.reduce((sum, result) => sum + effectCount(result.effects), 0),
      violations: diagnostics.length + results.reduce((sum, result) => sum + result.violations.length, 0),
    };
    return {
      schemaVersion: 1,
      generatedAt: nowIso(),
      webmcpSnapshot: WEBMCP_SNAPSHOT,
      target: settings.includeValues ? url : redactUrl(url),
      safeMode: settings.safe === true,
      passed: summary.failed === 0 && summary.diagnostics === 0 && summary.passed > 0,
      summary,
      diagnostics,
      tools: results,
    };
  } finally {
    if (ownsBrowser) await browser.close();
  }
}
