# AGENTS.md

## Purpose

Effectprint is a deterministic behavioral-contract runner for imperative WebMCP tools. It captures what a tool actually changes and compares those effects with `readOnlyHint` and developer-authored contracts.

## Start here

- Read `README.md` for product behavior and safety promises.
- Read `docs/architecture.md` before changing the browser lifecycle.
- Read `docs/contracts.md` before changing effect or violation semantics.
- Read `docs/threat-model.md` before touching safe mode.

## Commands

```bash
npm ci
npm test
npm run test:integration
npm run pack:check
npm run assets:render
node ./bin/effectprint.js demo --no-open
```

The browser integration and demo bind a localhost fixture and may require environment permission. They require installed Chrome by default. Set `EFFECTPRINT_BROWSER=chromium` after installing Playwright Chromium.

## Project map

- `src/browser/harness.js`: serialized into pages before application scripts. It must remain self-contained.
- `src/browser/audit.js`: browser lifecycle, safety routing, execution, and report assembly.
- `src/contracts.js`: pure effect matching and verification.
- `src/synthesize.js`: deterministic input generation.
- `src/reporters/`: pure report renderers.
- `fixtures/`: local, harmless poisoned examples.
- `schemas/`: public machine-readable interfaces.

## Non-negotiable invariants

- Safe mode stays on by default.
- Remote targets require explicit `--allow-remote`.
- Unannotated or write-capable tools are skipped unless their contract has `execute: true`.
- Blocked attempted effects remain in reports and can fail contracts.
- An `allow` rule never weakens `readOnlyHint`.
- Test fixtures use fake data, localhost, and harmless server behavior.
- Report schema changes require tests, TypeScript declarations, docs, and a schema update.
- Do not claim W3C conformance, certification, browser-vendor affiliation, or containment of arbitrary hostile code.

## Style

- Node 20+ ESM, no build step.
- Prefer built-in Node APIs. Keep dependencies minimal.
- Use stable uppercase violation codes and lowercase effect kinds.
- Add regression tests for every bug fix.
- Do not hand-edit `package-lock.json`; regenerate it with npm.
- `assets/social-preview.png` is generated from `assets/hero.svg`; edit the SVG source, then run `npm run assets:render`.
