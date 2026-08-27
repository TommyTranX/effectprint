import { escapeMarkdown } from "../utils.js";

export function renderMarkdown(report) {
  const verdict = report.passed ? "PASS" : "FAIL";
  const lines = [
    `# Effectprint: ${verdict}`,
    "",
    `Target: \`${escapeMarkdown(report.target)}\`  `,
    `Mode: ${report.safeMode ? "safe (mutation guards enabled)" : "writes allowed"}  `,
    `Generated: ${report.generatedAt}`,
    "",
    "| Tool | Result | Effects | Violations | Fingerprint |",
    "| --- | --- | ---: | ---: | --- |",
  ];
  for (const tool of report.tools) {
    const effects = tool.effects.reduce((sum, effect) => sum + (effect.count ?? 1), 0);
    lines.push(`| \`${escapeMarkdown(tool.tool)}\` | ${escapeMarkdown(tool.status)} | ${effects} | ${tool.violations.length} | ${tool.effectFingerprint ? `\`${escapeMarkdown(tool.effectFingerprint)}\`` : "-"} |`);
  }
  if ((report.diagnostics ?? []).length) {
    lines.push("", "## Audit diagnostics", "");
    for (const diagnostic of report.diagnostics) {
      lines.push(`- **${escapeMarkdown(diagnostic.code)}:** ${escapeMarkdown(diagnostic.message)}`);
    }
  }
  for (const tool of report.tools.filter((item) => item.violations.length)) {
    lines.push("", `## ${escapeMarkdown(tool.tool)}`, "");
    for (const violation of tool.violations) lines.push(`- **${escapeMarkdown(violation.code)}:** ${escapeMarkdown(violation.message)}`);
  }
  lines.push("", `_${report.summary.discovered} tools, ${report.summary.effects} effects, ${report.summary.violations} violations._`, "");
  return lines.join("\n");
}
