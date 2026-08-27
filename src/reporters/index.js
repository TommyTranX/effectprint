import { renderBadge } from "./badge.js";
import { renderHtml } from "./html.js";
import { renderJunit } from "./junit.js";
import { renderMarkdown } from "./markdown.js";
import { renderSarif } from "./sarif.js";
import { renderTerminal } from "./terminal.js";

export const FORMATS = ["terminal", "json", "markdown", "html", "junit", "sarif", "badge"];

export function renderReport(report, format = "terminal", options = {}) {
  switch (format) {
    case "terminal": return renderTerminal(report, options);
    case "json": return `${JSON.stringify(report, null, 2)}\n`;
    case "markdown": return `${renderMarkdown(report)}\n`;
    case "html": return renderHtml(report);
    case "junit": return renderJunit(report);
    case "sarif": return `${renderSarif(report, options.configPath)}\n`;
    case "badge": return renderBadge(report);
    default: throw new Error(`Unknown report format: ${format}`);
  }
}
