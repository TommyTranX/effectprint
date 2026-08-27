function colors(enabled) {
  const wrap = (code) => (value) => enabled ? `\u001b[${code}m${value}\u001b[0m` : String(value);
  return {
    bold: wrap("1"),
    dim: wrap("2"),
    green: wrap("32"),
    red: wrap("31"),
    yellow: wrap("33"),
    cyan: wrap("36"),
  };
}

function effectLine(effect, paint) {
  const blocked = effect.blocked ? paint.yellow("blocked") : "observed";
  const operation = sanitizeTerminal(effect.method ?? effect.operation ?? effect.kind);
  const target = sanitizeTerminal(effect.target ?? effect.url ?? "");
  const count = effect.count > 1 ? ` ×${effect.count}` : "";
  return `      ${paint.dim("effect")} ${operation} ${target}${count} (${blocked})`;
}

export function renderTerminal(report, options = {}) {
  const paint = colors(options.color ?? process.stdout.isTTY);
  const verdict = report.passed ? paint.green("PASS") : paint.red("FAIL");
  const lines = [
    "",
    `${paint.bold("Effectprint")}  ${verdict}`,
    `${paint.dim(sanitizeTerminal(report.target))}  ${report.safeMode ? paint.cyan("safe mode") : paint.yellow("writes allowed")}`,
    "",
  ];

  for (const diagnostic of report.diagnostics ?? []) {
    lines.push(`  ${paint.red("✗")} ${paint.red(sanitizeTerminal(diagnostic.code))}  ${sanitizeTerminal(diagnostic.message)}`);
  }

  for (const tool of report.tools) {
    if (tool.status === "passed") {
      const effects = tool.effects.reduce((sum, effect) => sum + (effect.count ?? 1), 0);
      lines.push(`  ${paint.green("✓")} ${paint.bold(sanitizeTerminal(tool.tool))}  ${effects} effect${effects === 1 ? "" : "s"}  ${tool.durationMs ?? 0}ms`);
    } else if (tool.status === "skipped") {
      lines.push(`  ${paint.yellow("○")} ${paint.bold(sanitizeTerminal(tool.tool))}  skipped: ${sanitizeTerminal(tool.reason)}`);
    } else {
      lines.push(`  ${paint.red("✗")} ${paint.bold(sanitizeTerminal(tool.tool))}  ${tool.violations.length} violation${tool.violations.length === 1 ? "" : "s"}`);
    }
    for (const violation of tool.violations) {
      lines.push(`      ${paint.red(sanitizeTerminal(violation.code))}  ${sanitizeTerminal(violation.message)}`);
    }
    for (const effect of tool.effects) lines.push(effectLine(effect, paint));
  }

  lines.push(
    "",
    `  ${report.summary.discovered} discovered  ${paint.green(report.summary.passed)} passed  ${paint.red(report.summary.failed)} failed  ${paint.yellow(report.summary.skipped)} skipped`,
    `  ${report.summary.effects} effects  ${report.summary.violations} violations`,
    "",
  );
  return lines.join("\n");
}
import { sanitizeTerminal } from "../utils.js";
