import { VERSION } from "../constants.js";

const CONFIG_RULES = new Set(["FORBIDDEN_EFFECT", "MISSING_EFFECT", "TOOL_NOT_AUDITED", "TOOL_NOT_FOUND", "UNDECLARED_EFFECT"]);

function ruleFor(code, message) {
  return {
    id: code,
    name: code.toLowerCase().replaceAll("_", "-"),
    shortDescription: { text: message.split(".")[0] },
    helpUri: `https://github.com/TommyTranX/effectprint/blob/main/docs/contracts.md#${code.toLowerCase().replaceAll("_", "-")}`,
  };
}

function locationsFor(code, configPath) {
  if (!configPath || !CONFIG_RULES.has(code)) return undefined;
  return [{
    physicalLocation: {
      artifactLocation: { uri: configPath },
      region: { startLine: 1 },
    },
  }];
}

export function renderSarif(report, configPath = null) {
  const results = [];
  const rules = new Map();
  const addResult = ({ code, message, properties = {} }) => {
    rules.set(code, ruleFor(code, message));
    const locations = locationsFor(code, configPath);
    results.push({
      ruleId: code,
      level: "error",
      message: { text: message },
      ...(locations ? { locations } : {}),
      properties,
    });
  };

  for (const diagnostic of report.diagnostics ?? []) {
    addResult({
      code: diagnostic.code,
      message: diagnostic.message,
      properties: { tool: diagnostic.tool ?? null, diagnostic: true },
    });
  }
  for (const tool of report.tools) {
    for (const violation of tool.violations) {
      addResult({
        code: violation.code,
        message: `${tool.tool}: ${violation.message}`,
        properties: { tool: tool.tool, effect: violation.effect ?? null },
      });
    }
  }

  return JSON.stringify({
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [{
      tool: {
        driver: {
          name: "Effectprint",
          informationUri: "https://github.com/TommyTranX/effectprint",
          rules: [...rules.values()],
          version: VERSION,
        },
      },
      results,
    }],
  }, null, 2);
}
