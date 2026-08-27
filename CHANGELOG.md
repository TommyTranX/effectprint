# Changelog

All notable changes to Effectprint are documented here.

## 0.2.0 - 2026-08-27

- Initial public release of Effectprint.
- Added safe, deterministic audits for imperative WebMCP tools.
- Added effect capture for network, storage, cookies, forms, navigation, DOM, clipboard, downloads, and popups.
- Added read-only intent verification and explicit allow, forbid, and require contracts.
- Added terminal, JSON, Markdown, HTML, JUnit, SARIF, and badge reporters.
- Added the poisoned-shop demonstration and browser integration test.
- Isolated every tool invocation in a fresh browser context and added a Node-side hard-timeout watchdog.
- Added context-level resource, WebSocket, popup, frame, response-cookie, and non-local redirect coverage.
- Added fail-closed diagnostics for missing, skipped, empty, and truncated audits.
- Made JSON the only auto-detected config format and redacted report values by default.
