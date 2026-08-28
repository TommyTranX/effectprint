# Reproducible audits of public WebMCP demos

Effectprint was run twice against two tools in the public [GoogleChromeLabs WebMCP tools repository](https://github.com/GoogleChromeLabs/webmcp-tools) at commit [`b16178461dadf01cbbd86f98a276caf2b69dc282`](https://github.com/GoogleChromeLabs/webmcp-tools/commit/b16178461dadf01cbbd86f98a276caf2b69dc282). Both audited invocations passed their strict contracts and produced the same effect fingerprint on the repeat run.

| Demo and tool | Result | Observed effects | Stable fingerprint |
| --- | --- | --- | --- |
| Explainer `getAvailability` | Pass | Three expected DOM updates | `13247628c519440c` |
| React Flight Search `listFlights` | Pass | None | `4f53cda18c2baa0c` |

The original run used Effectprint 0.2.0 at commit [`62118a177bc017e5f5e1d8380af4f2b4fe18cfec`](https://github.com/TommyTranX/effectprint/commit/62118a177bc017e5f5e1d8380af4f2b4fe18cfec), Chrome 141.0.7390.108, and Node.js 25.2.1. The checked-in contracts and sanitized reports are:

- [Explainer contract](../examples/real-world/explainer.effectprint.json) and [report](../examples/real-world/explainer.report.json)
- [React Flight Search contract](../examples/real-world/react-flightsearch.effectprint.json) and [report](../examples/real-world/react-flightsearch.report.json)

## Reproduce the Explainer audit

Clone the upstream repository and check out the audited source:

```bash
git clone https://github.com/GoogleChromeLabs/webmcp-tools.git /tmp/webmcp-tools
git -C /tmp/webmcp-tools checkout b16178461dadf01cbbd86f98a276caf2b69dc282
```

Start its static demo in one terminal:

```bash
python3 -m http.server 18181 --bind 127.0.0.1 \
  --directory /tmp/webmcp-tools/demos/explainer
```

From an Effectprint checkout, run the contract in another terminal:

```bash
npx --yes effectprint audit \
  --config examples/real-world/explainer.effectprint.json \
  --browser chrome --format json --out explainer.report.json --no-color
```

## Reproduce the React Flight Search audit

Build the pinned demo:

```bash
cd /tmp/webmcp-tools/demos/react-flightsearch
npm ci --ignore-scripts
npm run build
python3 -m http.server 18182 --bind 127.0.0.1 --directory dist
```

From an Effectprint checkout, run the contract in another terminal:

```bash
npx --yes effectprint audit \
  --config examples/real-world/react-flightsearch.effectprint.json \
  --browser chrome --format json --out react-flightsearch.report.json --no-color
```

## Interpretation and limits

Each pass covers one invocation with one deterministic input, not every possible input or branch. Write-capable tools were explicitly skipped. Effectprint covers browser-observable effects and does not currently validate a tool's `outputSchema`. The reports establish repeatable observations for the pinned source and environment; they are not a certification of either demo.

The upstream repository is licensed under Apache-2.0. These reports quote public tool metadata solely to identify the audited interfaces.
