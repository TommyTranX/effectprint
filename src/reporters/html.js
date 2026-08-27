import { escapeHtml } from "../utils.js";

function effectCard(effect) {
  const operation = effect.method ?? effect.operation ?? effect.kind;
  const target = effect.target ?? effect.url ?? "page state";
  return `<li class="effect">
    <span class="effect-kind">${escapeHtml(effect.kind)}</span>
    <code>${escapeHtml(operation)} ${escapeHtml(target)}</code>
    <span class="pill ${effect.blocked ? "blocked" : "observed"}">${effect.blocked ? "blocked" : "observed"}${effect.count > 1 ? ` ×${effect.count}` : ""}</span>
  </li>`;
}

function toolCard(tool) {
  const passed = tool.status === "passed";
  const skipped = tool.status === "skipped";
  const state = passed ? "pass" : skipped ? "skip" : "fail";
  const symbol = passed ? "✓" : skipped ? "○" : "✕";
  const violations = tool.violations.length
    ? `<div class="violations">${tool.violations.map((item) => `<div class="violation"><strong>${escapeHtml(item.code)}</strong><span>${escapeHtml(item.message)}</span></div>`).join("")}</div>`
    : "";
  const effects = tool.effects.length
    ? `<ul class="effects">${tool.effects.map(effectCard).join("")}</ul>`
    : `<p class="muted">${escapeHtml(tool.reason ?? "No observable effects")}</p>`;
  return `<article class="tool ${state}">
    <header><span class="tool-symbol">${symbol}</span><div><h2>${escapeHtml(tool.tool)}</h2><p>${escapeHtml(tool.description ?? "")}</p></div><span class="status">${state}</span></header>
    ${violations}
    ${effects}
    ${tool.effectFingerprint ? `<footer>effect fingerprint <code>${tool.effectFingerprint}</code> · ${tool.durationMs ?? 0}ms</footer>` : ""}
  </article>`;
}

export function renderHtml(report) {
  const state = report.passed ? "pass" : "fail";
  const verdict = report.passed ? "Observed contract passed" : "Contract check failed";
  const data = JSON.stringify(report).replaceAll("<", "\\u003c");
  const diagnostics = (report.diagnostics ?? []).length
    ? `<section class="diagnostics">${report.diagnostics.map((item) => `<div class="diagnostic"><strong>${escapeHtml(item.code)}</strong><span>${escapeHtml(item.message)}</span></div>`).join("")}</section>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Effectprint · ${escapeHtml(verdict)}</title>
  <style>
    :root { color-scheme: dark; --bg:#090b10; --panel:#11151d; --line:#242b38; --text:#f5f7fb; --muted:#9ba7ba; --green:#42d392; --red:#ff6577; --amber:#f7c66b; --cyan:#7cdcf3; }
    * { box-sizing:border-box; }
    body { margin:0; background:radial-gradient(circle at 15% -10%,#16332a 0,transparent 35%),var(--bg); color:var(--text); font:15px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    main { width:min(980px,calc(100% - 32px)); margin:0 auto; padding:56px 0 80px; }
    .eyebrow { color:var(--cyan); font:700 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.16em; text-transform:uppercase; }
    h1 { max-width:800px; margin:14px 0 12px; font-size:clamp(38px,7vw,72px); line-height:.98; letter-spacing:-.055em; }
    .lead { color:var(--muted); font-size:18px; }
    .verdict { display:inline-flex; align-items:center; gap:9px; margin:28px 0; padding:9px 13px; border:1px solid; border-radius:999px; font-weight:750; }
    .verdict.pass { color:var(--green); background:#10251e; border-color:#245d48; }
    .verdict.fail { color:var(--red); background:#2a1218; border-color:#6f2a38; }
    .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin:14px 0 32px; }
    .stat { padding:16px; background:rgba(17,21,29,.8); border:1px solid var(--line); border-radius:14px; }
    .stat strong { display:block; font-size:26px; }
    .stat span { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
    .tool { margin:14px 0; overflow:hidden; background:rgba(17,21,29,.9); border:1px solid var(--line); border-left:4px solid var(--line); border-radius:15px; }
    .tool.pass { border-left-color:var(--green); } .tool.fail { border-left-color:var(--red); } .tool.skip { border-left-color:var(--amber); }
    .tool header { display:grid; grid-template-columns:34px 1fr auto; gap:10px; align-items:start; padding:20px; }
    .tool h2 { margin:0; font:700 17px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace; }
    .tool p { margin:5px 0 0; color:var(--muted); }
    .tool-symbol { font-size:20px; } .pass .tool-symbol { color:var(--green); } .fail .tool-symbol { color:var(--red); } .skip .tool-symbol { color:var(--amber); }
    .status,.pill,.effect-kind { padding:3px 8px; border-radius:999px; font:700 10px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.07em; text-transform:uppercase; }
    .status { background:#202735; color:var(--muted); }
    .violations { border-top:1px solid var(--line); background:#1b1116; }
    .diagnostics { margin:14px 0; overflow:hidden; background:#1b1116; border:1px solid #6f2a38; border-radius:15px; }
    .diagnostic { display:grid; grid-template-columns:220px 1fr; gap:12px; padding:14px 20px; border-bottom:1px solid #362029; }
    .diagnostic:last-child { border-bottom:0; } .diagnostic strong { color:var(--red); font:700 12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
    .violation { display:grid; grid-template-columns:190px 1fr; gap:12px; padding:13px 20px; border-bottom:1px solid #362029; }
    .violation strong { color:var(--red); font:700 12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
    .effects { margin:0; padding:8px 20px 14px; list-style:none; }
    .effect { display:grid; grid-template-columns:86px 1fr auto; gap:10px; align-items:center; padding:9px 0; border-bottom:1px solid var(--line); }
    .effect:last-child { border-bottom:0; } .effect-kind { color:var(--cyan); background:#10242a; text-align:center; }
    code { color:#dce4f2; font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; overflow-wrap:anywhere; }
    .pill.blocked { color:var(--amber); background:#302610; } .pill.observed { color:var(--muted); background:#202735; }
    .muted { padding:0 20px 18px; color:var(--muted); }
    footer { padding:12px 20px; color:var(--muted); background:#0e1219; border-top:1px solid var(--line); font-size:12px; }
    .report-meta { margin-top:30px; color:var(--muted); font-size:12px; }
    @media(max-width:650px){ .stats{grid-template-columns:repeat(2,1fr)} .violation{grid-template-columns:1fr} .effect{grid-template-columns:1fr}.tool header{grid-template-columns:28px 1fr}.status{display:none} }
  </style>
</head>
<body class="${state}">
  <main>
    <div class="eyebrow">Effectprint behavioral contract</div>
    <h1>${escapeHtml(verdict)}</h1>
    <p class="lead">${escapeHtml(report.target)}</p>
    <div class="verdict ${state}">${report.passed ? "✓" : "✕"} ${report.passed ? "Observed contract passed for every audited invocation" : `${report.summary.violations} violation${report.summary.violations === 1 ? "" : "s"} found`}</div>
    <section class="stats">
      <div class="stat"><strong>${report.summary.discovered}</strong><span>discovered</span></div>
      <div class="stat"><strong>${report.summary.passed}</strong><span>passed</span></div>
      <div class="stat"><strong>${report.summary.effects}</strong><span>effects</span></div>
      <div class="stat"><strong>${report.summary.violations}</strong><span>violations</span></div>
    </section>
    ${diagnostics}
    <section>${report.tools.map(toolCard).join("")}</section>
    <p class="report-meta">Generated ${escapeHtml(report.generatedAt)} · safe mode ${report.safeMode ? "on" : "off"} · WebMCP snapshot ${escapeHtml(report.webmcpSnapshot)}</p>
  </main>
  <script type="application/json" id="effectprint-report">${data}</script>
</body>
</html>`;
}
