import test from "node:test";
import assert from "node:assert/strict";
import { renderReport } from "../src/reporters/index.js";

const report = {
  schemaVersion: 1,
  generatedAt: "2026-08-27T00:00:00.000Z",
  webmcpSnapshot: "2026-08-26",
  target: "http://127.0.0.1:3000",
  safeMode: true,
  passed: false,
  summary: { discovered: 1, passed: 0, failed: 1, skipped: 0, diagnostics: 0, effects: 1, violations: 1 },
  diagnostics: [],
  tools: [{
    tool: "search_products",
    description: "Search products",
    status: "failed",
    durationMs: 12,
    effectFingerprint: "abc123",
    effects: [{ kind: "network", method: "POST", target: "/checkout", blocked: true }],
    violations: [{ code: "READ_ONLY_MUTATION", message: "Attempted POST" }],
  }],
};

test("JSON report is machine-readable", () => {
  assert.equal(JSON.parse(renderReport(report, "json")).passed, false);
});

test("all text report formats carry the violation", () => {
  for (const format of ["terminal", "markdown", "html", "junit", "sarif"]) {
    assert.match(renderReport(report, format, { color: false }), /READ_ONLY_MUTATION|read-only-mutation/);
  }
});

test("HTML report embeds escaped data", () => {
  const hostile = structuredClone(report);
  hostile.target = "</script><script>alert(1)</script>";
  const html = renderReport(hostile, "html");
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /\\u003c\/script>/);
});

test("terminal, Markdown, and XML reporters neutralize untrusted display text", () => {
  const hostile = structuredClone(report);
  hostile.tools[0].tool = "\u001b]8;;https://evil.invalid\u0007click\u001b]8;;\u0007<script>";
  const terminal = renderReport(hostile, "terminal", { color: false });
  assert.doesNotMatch(terminal, /\u001b|\u0007/);
  assert.doesNotMatch(renderReport(hostile, "markdown"), /<script>/);
  assert.doesNotMatch(renderReport(hostile, "junit"), /<script>/);
});

test("badge reflects the verdict", () => {
  assert.match(renderReport(report, "badge"), /1 violations/);
  assert.match(renderReport({ ...report, passed: true, summary: { ...report.summary, violations: 0 } }, "badge"), /contract passed/);
});

test("top-level diagnostics fail every CI reporter", () => {
  const empty = {
    ...report,
    tools: [],
    diagnostics: [{ code: "NO_TOOLS_AUDITED", message: "Nothing was audited" }],
    summary: { discovered: 0, passed: 0, failed: 0, skipped: 0, diagnostics: 1, effects: 0, violations: 1 },
  };
  for (const format of ["terminal", "markdown", "html", "junit", "sarif"]) {
    assert.match(renderReport(empty, format, { color: false }), /NO_TOOLS_AUDITED|no-tools-audited/);
  }
  assert.match(renderReport(empty, "junit"), /failures="1"/);
  assert.match(renderReport(empty, "badge"), /1 violations/);
});
