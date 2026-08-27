# Threat model and limitations

Effectprint executes application code. Treat every target and tool implementation cautiously, even when it belongs to your own project. Version 0.2 is designed to diagnose cooperative, non-evasive application code; it is not a sandbox for a page actively trying to forge or bypass its evidence.

## Intended environment

Use Effectprint against localhost, preview deployments, disposable accounts, seeded databases, and isolated test payment providers. The default guard reduces risk but does not turn arbitrary hostile code into safe code.

## Safety boundaries

Effectprint 0.2 provides these controls:

- A new, non-persistent Playwright context for discovery and for every individual tool invocation.
- Refusal of remote targets unless `--allow-remote` is explicit.
- Automatic execution only for tools marked `readOnlyHint: true`.
- Explicit `execute: true` before unannotated or write-capable tools run.
- Context-level routing for HTTP requests, WebSockets, frames, workers, and popups.
- Browser-level blocking for non-safe HTTP methods, cross-origin execution traffic, WebSockets, and navigation.
- In-page hooks for fetch, XHR, beacon, forms, common cookie/storage methods, history, clipboard writes, popups, and downloads.
- Observation of response `Set-Cookie` inside the disposable context; it is evidence but is not stripped from the isolated response.
- Service workers disabled in the audit context.
- Timeout and abort signaling in-page plus a Node-side watchdog that closes a non-yielding renderer.
- Default report redaction for inputs, outputs, query values, and value previews.

Blocked attempts remain in the report. This is necessary because Effectprint verifies implementation intent, not merely final server state.

## Known limitations

- A GET request can have server-side effects despite HTTP semantics. Browser resource GETs during the invocation are recorded, so add explicit `forbid` matchers for suspicious endpoints.
- WebSockets are routed and blocked in safe mode, but WebRTC, WebTransport, browser extensions, native protocol handlers, and side channels are not contained in 0.2.
- Code can attempt effects before the harness loads if it runs outside normal page script execution.
- JavaScript config files are imported as trusted local code only when passed explicitly. Use the auto-detected JSON config in untrusted repositories and CI.
- Page hooks live in the application realm. Although the control object is frozen, evasive code can call its methods, reach saved native setters, create unsupported channels, detect instrumentation, or behave differently. Context routing still covers ordinary HTTP, WebSocket, popup, frame, and worker traffic, but Effectprint does not claim tamper-proof evidence.
- Exact storage coverage is method-based: common Storage, IndexedDB object-store/cursor, Cache, document-cookie, and Cookie Store writes are hooked. IndexedDB schema creation, `caches.open`, native prototype calls, named storage-property writes, and future browser APIs may be observed only by snapshots or missed.
- Dedicated/shared-worker network traffic is context-routed, but worker-only storage APIs are not instrumented in 0.2.
- DOM summaries report observable mutations, not semantic equivalence with a human UI flow.
- Frame hooks are injected context-wide, but detached or rapidly navigating frames can outrun collection.
- Effects scheduled after the settle window can be missed. Unrelated polling or DOM work during that window can be attributed to the tool.
- A passing result covers the audited input and invocation only. It does not establish behavior across all inputs or prove a server committed a requested operation.
- Declarative WebMCP forms are not executed in 0.2 because their invocation and result behavior remains under specification.
- `--include-values` can place sensitive input, output, query, cookie, or storage data into HTML, JSON, and CI artifacts.
- `--allow-writes` intentionally disables all safe-mode mutation guards.

Do not point Effectprint at production with a privileged session. Do not enter real payment, identity, health, financial, or authentication data into contract fixtures.

## Adversaries

The initial model includes accidental side effects, stale annotations, hidden requests, implementation drift, misleading descriptions, and compromised dependencies that still use ordinary browser APIs. It does not claim to resist code deliberately written to forge instrumentation, contain a browser exploit, or protect against operating-system compromise.

## Reporting a bypass

If you find a path that causes a real persistent effect despite safe mode, follow [SECURITY.md](../SECURITY.md). Include a minimal fixture, browser version, Effectprint version, and the expected versus observed effect. Do not test a bypass against systems you do not own or lack authorization to assess.
