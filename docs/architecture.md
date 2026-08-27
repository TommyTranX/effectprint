# Architecture

Effectprint separates browser capture from contract verification so reports remain deterministic and adapters can evolve independently.

1. The runner discovers tools in a disposable Playwright context with service workers blocked.
2. A pre-page harness captures `document.modelContext.registerTool` and legacy `navigator.modelContext` registrations.
3. Each eligible tool is reloaded and executed in its own fresh context using contract input or deterministic schema synthesis.
4. In-page wrappers plus context-level HTTP, WebSocket, response, popup, worker, and frame observation record attempted effects.
5. Safe mode blocks guarded effects, while a Node-side watchdog can close a renderer that stops yielding.
6. The verifier applies `readOnlyHint`, `forbid`, `require`, optional strict-effect rules, and fail-closed coverage diagnostics.
7. Reporters serialize the same redacted report object to terminal, JSON, Markdown, HTML, JUnit, SARIF, or SVG.

## Project map

```text
bin/effectprint.js           CLI entry point
src/browser/harness.js     Self-contained page instrumentation
src/browser/audit.js       Playwright lifecycle and audit orchestration
src/contracts.js           Effect matching and violation logic
src/synthesize.js          Deterministic JSON Schema input synthesis
src/reporters/             Output adapters
fixtures/poisoned-shop/    Safe demonstration fixture
schemas/                   Public configuration and report schemas
tests/                     Unit and opt-in browser integration tests
```

## Invariants

- Safe mode is the default.
- Remote targets require explicit opt-in.
- A blocked attempt is still an observed effect.
- Read-only semantics cannot be weakened by a local allow matcher.
- Unannotated tools are never auto-executed.
- Configured and selected tool names must be discovered.
- No-audit and truncated-capture outcomes fail closed.
- Report data is independent of presentation format.
- The injected harness is self-contained because Playwright serializes it into the page.
