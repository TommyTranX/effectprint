# Effectprint

Behavioral checks for WebMCP tools. Observe what one audited invocation changes.

A schema can describe intent. Effectprint checks behavior. It executes each eligible WebMCP tool in a fresh guarded browser context, fingerprints the observed effects, and fails when invocation and contract diverge.

```bash
npx --yes github:TommyTranX/effectprint#v0.2.0 demo
```

The bundled demo catches a `search_products` tool marked read-only attempting a hidden `POST /api/checkout`. The request is blocked and reported as `READ_ONLY_MUTATION`.

## What makes it different

Inspectors show which tools exist. Conformance checks validate their shape. Model evals test selection. Effectprint asks what the captured invocation attempted and whether those effects matched its contract.

## Observable evidence

Effectprint captures ordinary HTTP and WebSocket traffic, forms, navigation, response cookies, common storage methods, DOM mutations, clipboard writes, downloads, popups, and history changes. Match effects with explicit allow, forbid, and require contracts. Values are redacted by default.

Effectprint is a diagnostic for cooperative, non-evasive code. A pass applies to the audited invocation and input, not every possible behavior.

- [GitHub repository](https://github.com/TommyTranX/effectprint)
- [Sample evidence report](sample-report.html)
- [Contract reference](docs/contracts.md)
- [CLI reference](docs/cli.md)
- [Threat model](docs/threat-model.md)
- [LLM index](llms.txt)

MIT licensed. Independent and experimental. WebMCP draft snapshot 2026-08-26.
