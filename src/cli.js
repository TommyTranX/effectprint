import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { extname, relative, resolve } from "node:path";
import { auditUrl, discoverUrl } from "./browser/audit.js";
import { loadConfig } from "./config.js";
import { EXIT, VERSION } from "./constants.js";
import { DEMO_CONFIG, startPoisonedShop } from "./demo.js";
import { FORMATS, renderReport } from "./reporters/index.js";
import { sanitizeTerminal, writeTextFile } from "./utils.js";

const HELP = `
Effectprint ${VERSION}
Behavioral checks for WebMCP tools. Observe what one audited invocation changes.

Usage
  effectprint demo [options]
  effectprint audit <url> [options]
  effectprint list <url> [options]
  effectprint init [path]

Commands
  demo                 Catch a hidden checkout in the bundled poisoned shop
  audit <url>          Execute eligible tools in a disposable browser context
  list <url>           Discover imperative tools without executing them
  init [path]          Create a starter .effectprint.json

Audit options
  -c, --config <path>  Contract file (default: auto-detect .effectprint.json)
  -t, --tool <name>    Audit one tool; repeat to select several
  -f, --format <name>  terminal, json, markdown, html, junit, sarif, badge
  -o, --out <path>     Write the selected format to a file
      --badge <path>   Also write a contract-passed/violations SVG badge
      --browser <name> chrome (default), chrome-beta, chrome-canary, chromium
      --headed         Show the browser window
      --timeout <ms>   Tool timeout (default: 5000)
      --settle <ms>    Effect collection window after return (default: 150)
      --allow-remote   Permit an authorized non-local target
      --allow-writes   Disable all safe-mode mutation guards (dangerous)
      --include-values Include inputs, outputs, query values, and previews
      --no-color       Disable ANSI colors

Safety
  Effectprint blocks HTTP methods other than GET/HEAD/OPTIONS, cross-origin
  execution traffic, forms, navigation, common cookie/storage writes,
  clipboard writes, WebSockets, and popups in safe mode. It refuses remote
  targets unless --allow-remote is explicit. Unannotated or write-capable tools
  are skipped unless their contract sets execute: true.

Examples
  effectprint demo
  effectprint audit http://127.0.0.1:3000
  effectprint audit http://127.0.0.1:3000 --format sarif --out effectprint.sarif
`.trimStart();

function parseArgs(argv) {
  const parsed = {
    command: null,
    positionals: [],
    toolNames: [],
    open: true,
    safe: true,
  };
  const valueOptions = new Map([
    ["-c", "config"], ["--config", "config"],
    ["-t", "tool"], ["--tool", "tool"],
    ["-f", "format"], ["--format", "format"],
    ["-o", "out"], ["--out", "out"],
    ["--badge", "badge"], ["--browser", "browser"],
    ["--timeout", "timeoutMs"], ["--settle", "settleMs"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") parsed.help = true;
    else if (argument === "--version" || argument === "-v") parsed.version = true;
    else if (argument === "--headed") parsed.headed = true;
    else if (argument === "--allow-remote") parsed.allowRemote = true;
    else if (argument === "--allow-writes") parsed.safe = false;
    else if (argument === "--include-values") parsed.includeValues = true;
    else if (argument === "--no-open") parsed.open = false;
    else if (argument === "--open") parsed.open = true;
    else if (argument === "--no-color") parsed.color = false;
    else if (valueOptions.has(argument)) {
      const key = valueOptions.get(argument);
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) throw new Error(`${argument} requires a value`);
      index += 1;
      if (key === "tool") parsed.toolNames.push(value);
      else parsed[key] = value;
    } else if (argument.startsWith("--") && argument.includes("=")) {
      const [flag, value] = argument.split(/=(.*)/s, 2);
      const key = valueOptions.get(flag);
      if (!key) throw new Error(`Unknown option: ${flag}`);
      if (key === "tool") parsed.toolNames.push(value);
      else parsed[key] = value;
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (!parsed.command) {
      parsed.command = argument;
    } else {
      parsed.positionals.push(argument);
    }
  }
  for (const key of ["timeoutMs", "settleMs"]) {
    if (parsed[key] === undefined) continue;
    parsed[key] = Number(parsed[key]);
    if (!Number.isFinite(parsed[key]) || parsed[key] < 0) throw new Error(`${key} must be a non-negative number`);
  }
  if (parsed.format && !FORMATS.includes(parsed.format)) {
    throw new Error(`Unknown format ${parsed.format}. Choose: ${FORMATS.join(", ")}`);
  }
  return parsed;
}

function inferFormat(path, fallback = "terminal") {
  const formats = {
    ".html": "html", ".json": "json", ".md": "markdown", ".sarif": "sarif",
    ".svg": "badge", ".xml": "junit",
  };
  return formats[extname(path ?? "").toLowerCase()] ?? fallback;
}

function extensionForFormat(format) {
  return {
    badge: "svg", html: "html", json: "json", junit: "xml",
    markdown: "md", sarif: "sarif", terminal: "txt",
  }[format] ?? "txt";
}

function browserOptions(args) {
  return {
    allowRemote: args.allowRemote,
    browser: args.browser,
    headed: args.headed,
    includeValues: args.includeValues,
    safe: args.safe,
    settleMs: args.settleMs,
    timeoutMs: args.timeoutMs,
    toolNames: args.toolNames,
  };
}

async function openFile(path) {
  const command = process.platform === "darwin"
    ? ["open", path]
    : process.platform === "win32"
      ? ["cmd", "/c", "start", "", path]
      : ["xdg-open", path];
  const child = spawn(command[0], command.slice(1), { detached: true, stdio: "ignore" });
  child.unref();
}

async function outputReport(report, args, defaults = {}) {
  const outPath = args.out ? resolve(args.out) : defaults.out ? resolve(defaults.out) : null;
  const format = args.format ?? inferFormat(outPath, defaults.format ?? "terminal");
  const configPath = args.config ? (relative(process.cwd(), args.config) || ".effectprint.json") : null;
  if (outPath) {
    await writeTextFile(outPath, renderReport(report, format, { configPath }));
    process.stdout.write(renderReport(report, "terminal", { color: args.color }));
    process.stdout.write(`Report: ${outPath}\n`);
  } else {
    process.stdout.write(renderReport(report, format, { color: args.color, configPath }));
  }
  if (args.badge) {
    const badgePath = resolve(args.badge);
    await writeTextFile(badgePath, renderReport(report, "badge"));
    process.stdout.write(`Badge: ${badgePath}\n`);
  }
  return outPath;
}

async function runDemo(args) {
  const fixture = await startPoisonedShop();
  try {
    const report = await auditUrl(fixture.url, DEMO_CONFIG, browserOptions(args));
    const demoFormat = args.format ?? "html";
    const defaultOut = `.effectprint/demo.${extensionForFormat(demoFormat)}`;
    const outPath = await outputReport(report, args, { out: defaultOut, format: demoFormat });
    const caught = report.tools.some((tool) => tool.violations.some((item) => item.code === "READ_ONLY_MUTATION"));
    const blocked = report.tools.some((tool) => tool.effects.some((effect) => effect.method === "POST" && effect.blocked));
    if (fixture.state.completedPurchases !== 0) {
      throw new Error("Safety invariant failed: the poisoned fixture completed a purchase");
    }
    if (caught && blocked) {
      process.stdout.write("Demo succeeded: poisoned behavior was caught and zero purchases reached the server.\n");
    }
    if (args.open && outPath && process.stdout.isTTY) await openFile(outPath);
    process.exitCode = caught && blocked ? EXIT.pass : EXIT.violation;
  } finally {
    await fixture.close();
  }
}

async function runAudit(args) {
  const { path, config } = await loadConfig(args.config);
  const url = args.positionals[0] ?? config.url;
  if (!url) throw new Error("audit requires a URL, or url in the config file");
  const report = await auditUrl(url, config, browserOptions(args));
  await outputReport(report, { ...args, config: path ?? args.config });
  process.exitCode = report.passed ? EXIT.pass : EXIT.violation;
}

async function runList(args) {
  const url = args.positionals[0];
  if (!url) throw new Error("list requires a URL");
  const tools = await discoverUrl(url, browserOptions(args));
  if (args.format && !["json", "terminal"].includes(args.format)) {
    throw new Error("list supports only terminal or json format");
  }
  let contents = `Effectprint discovered ${tools.length} imperative tool${tools.length === 1 ? "" : "s"}\n\n`;
  for (const tool of tools) {
    const mode = tool.annotations?.readOnlyHint === true ? "read-only" : "write/unknown";
    contents += `  ${sanitizeTerminal(tool.name)}  [${mode}]\n    ${sanitizeTerminal(tool.description)}\n`;
  }
  if (args.format === "json") contents = `${JSON.stringify({ target: url, tools }, null, 2)}\n`;
  if (args.out) {
    const outPath = resolve(args.out);
    await writeTextFile(outPath, contents);
    process.stdout.write(`Report: ${outPath}\n`);
  } else process.stdout.write(contents);
}

const CONFIG_VALUE = {
  $schema: "https://raw.githubusercontent.com/TommyTranX/effectprint/main/schemas/config.schema.json",
  version: 1,
  url: "http://127.0.0.1:3000",
  tools: {
    search_products: {
      input: { query: "running shoes", maxPrice: 120 },
      require: [
        { kind: "network", method: "GET", url: "*/api/products*" },
        { kind: "dom", operation: "dom.mutate" },
      ],
      forbid: [
        { kind: "network", mutating: true },
        { kind: "storage" },
        { kind: "navigation" },
      ],
    },
  },
};

const JS_CONFIG_TEMPLATE = `import { defineConfig } from "effectprint";

export default defineConfig(${JSON.stringify(CONFIG_VALUE, null, 2)});
`;

async function runInit(args) {
  const path = resolve(args.positionals[0] ?? ".effectprint.json");
  try {
    await access(path);
    throw new Error(`Refusing to overwrite existing file: ${path}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const extension = extname(path).toLowerCase();
  if (!new Set([".json", ".js", ".mjs"]).has(extension)) {
    throw new Error("Config paths must end in .json, .js, or .mjs");
  }
  const contents = extension === ".json" ? `${JSON.stringify(CONFIG_VALUE, null, 2)}\n` : JS_CONFIG_TEMPLATE;
  await writeTextFile(path, contents);
  process.stdout.write(`Created ${path}\n`);
}

export async function main(argv) {
  const args = parseArgs(argv);
  if (args.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (args.help || !args.command) {
    process.stdout.write(HELP);
    return;
  }
  switch (args.command) {
    case "demo": return runDemo(args);
    case "audit": return runAudit(args);
    case "list": return runList(args);
    case "init": return runInit(args);
    default: throw new Error(`Unknown command: ${args.command}\n\n${HELP}`);
  }
}
