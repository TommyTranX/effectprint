import { escapeXml } from "../utils.js";

export function renderJunit(report) {
  const diagnosticCases = (report.diagnostics ?? []).map((diagnostic) => (
    `<testcase classname="effectprint.audit" name="${escapeXml(diagnostic.code)}" time="0.000"><failure message="${escapeXml(diagnostic.message)}">${escapeXml(diagnostic.message)}</failure></testcase>`
  ));
  const toolCases = report.tools.map((tool) => {
    const time = ((tool.durationMs ?? 0) / 1000).toFixed(3);
    let body = "";
    if (tool.status === "skipped") {
      body = `<skipped message="${escapeXml(tool.reason)}"/>`;
    } else if (tool.violations.length) {
      const message = tool.violations.map((item) => `${item.code}: ${item.message}`).join("\n");
      body = `<failure message="${escapeXml(`${tool.violations.length} behavioral contract violation(s)`)}">${escapeXml(message)}</failure>`;
    }
    return `<testcase classname="effectprint" name="${escapeXml(tool.tool)}" time="${time}">${body}</testcase>`;
  });
  const cases = [...diagnosticCases, ...toolCases].join("");
  const failures = report.summary.failed + diagnosticCases.length;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="Effectprint" tests="${diagnosticCases.length + toolCases.length}" failures="${failures}" skipped="${report.summary.skipped}" timestamp="${escapeXml(report.generatedAt)}">${cases}</testsuite>\n`;
}
