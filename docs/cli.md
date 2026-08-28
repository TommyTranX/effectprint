# CLI reference

Install Effectprint from npm before using the commands below:

```bash
npm install --save-dev effectprint
```

## `effectprint demo`

Runs the bundled poisoned-shop fixture, catches a hidden checkout from a read-only tool, and writes `.effectprint/demo.html`.

```bash
npx effectprint demo --no-open
```

The demo returns exit code 0 only when the hidden mutation is detected, the request is blocked, and the fixture server completes zero purchases.

## `effectprint audit <url>`

Discovers imperative WebMCP tools, chooses eligible tools, executes each in a disposable browser context, and verifies effects.

```bash
npx effectprint audit http://127.0.0.1:3000
```

The URL can instead be set in `.effectprint.json`. That is the only auto-detected config. A `.js` or `.mjs` config must be passed explicitly and executes as trusted local Node.js code.

| Option | Meaning |
| --- | --- |
| `-c, --config <path>` | Load a specific contract file. |
| `-t, --tool <name>` | Select a tool. Repeat the option for several tools. |
| `-f, --format <name>` | `terminal`, `json`, `markdown`, `html`, `junit`, `sarif`, or `badge`. |
| `-o, --out <path>` | Write the selected report to a file. The extension infers the format when `--format` is omitted. |
| `--badge <path>` | Also write a verdict badge. |
| `--browser <name>` | `chrome`, `chrome-beta`, `chrome-canary`, or Playwright `chromium`. |
| `--headed` | Show the audit browser. |
| `--timeout <ms>` | Maximum execute-handler duration. Default: 5000. |
| `--settle <ms>` | Capture effects after the handler resolves. Default: 150. |
| `--allow-remote` | Permit an authorized non-local target. Safe mode remains enabled. |
| `--allow-writes` | Disable all safe-mode mutation guards. This may create real side effects. |
| `--include-values` | Include exact inputs, outputs, query values, and value previews. They are redacted or omitted by default. |
| `--no-color` | Disable ANSI terminal colors. |

Exit codes:

| Code | Meaning |
| ---: | --- |
| 0 | At least one tool was audited and all audited tools passed. |
| 1 | A violation occurred, execution failed, or no eligible tool was audited. |
| 2 | Usage, configuration, browser launch, or target setup failed. |

## `effectprint list <url>`

Discovers tools without executing them.

```bash
npx effectprint list http://127.0.0.1:3000
npx effectprint list http://127.0.0.1:3000 --format json
```

## `effectprint init [path]`

Writes a starter JSON configuration. It refuses to overwrite an existing file. Passing an explicit `.js` or `.mjs` path creates the trusted-code variant.

```bash
npx effectprint init
npx effectprint init tests/.effectprint.json
npx effectprint init tests/effectprint.config.mjs
```

## CI examples

SARIF for GitHub code scanning:

```bash
npx effectprint audit http://127.0.0.1:3000 \
  --browser chromium \
  --format sarif \
  --out .effectprint/results.sarif
```

JUnit for test systems:

```bash
npx effectprint audit http://127.0.0.1:3000 \
  --format junit \
  --out .effectprint/results.xml
```

Machine-readable JSON is validated by [`schemas/report.schema.json`](../schemas/report.schema.json).
