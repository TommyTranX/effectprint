import { escapeXml } from "../utils.js";

export function renderBadge(report) {
  const value = report.passed ? "contract passed" : `${report.summary.violations} violations`;
  const color = report.passed ? "#2ea44f" : "#d73a49";
  const left = 76;
  const right = Math.max(62, value.length * 7 + 14);
  const total = left + right;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="Effectprint: ${escapeXml(value)}">
  <title>Effectprint: ${escapeXml(value)}</title>
  <linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset="1" stop-opacity=".08"/></linearGradient>
  <clipPath id="r"><rect width="${total}" height="20" rx="3"/></clipPath>
  <g clip-path="url(#r)"><rect width="${left}" height="20" fill="#363b43"/><rect x="${left}" width="${right}" height="20" fill="${color}"/><rect width="${total}" height="20" fill="url(#s)"/></g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="${left / 2}" y="15" fill="#010101" fill-opacity=".3">Effectprint</text><text x="${left / 2}" y="14">Effectprint</text><text x="${left + right / 2}" y="15" fill="#010101" fill-opacity=".3">${escapeXml(value)}</text><text x="${left + right / 2}" y="14">${escapeXml(value)}</text></g>
</svg>\n`;
}
