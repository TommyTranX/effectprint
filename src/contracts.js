import { globMatch, isPlainObject } from "./utils.js";

export const PERSISTENT_EFFECT_KINDS = new Set([
  "clipboard",
  "cookie",
  "download",
  "navigation",
  "storage",
]);

export function isMutatingEffect(effect) {
  if (effect.kind === "network") return effect.mutating === true;
  if (effect.kind === "form") return effect.mutating !== false;
  return PERSISTENT_EFFECT_KINDS.has(effect.kind);
}

export function matchEffect(matcher, effect) {
  if (typeof matcher === "string") return globMatch(matcher, `${effect.kind}:${effect.operation ?? ""}:${effect.target ?? ""}`);
  if (!isPlainObject(matcher)) return false;
  for (const [key, expected] of Object.entries(matcher)) {
    if (key === "url") {
      if (!globMatch(expected, effect.url ?? effect.target ?? "")) return false;
    } else if (key === "method") {
      if (!globMatch(String(expected).toUpperCase(), String(effect.method ?? "").toUpperCase())) return false;
    } else if (key === "mutating" || key === "blocked" || key === "crossOrigin") {
      if (!(key in effect) || effect[key] !== expected) return false;
    } else if (!globMatch(expected, effect[key])) {
      return false;
    }
  }
  return true;
}

function violation(code, message, details = {}) {
  return { code, message, ...details };
}

export function verifyEffects(tool, effects, contract = {}) {
  const violations = [];
  const readOnly = tool.annotations?.readOnlyHint === true;

  if (readOnly) {
    for (const effect of effects.filter(isMutatingEffect)) {
      violations.push(violation(
        "READ_ONLY_MUTATION",
        `Tool declares readOnlyHint but attempted ${effect.operation ?? effect.kind} on ${effect.target ?? effect.url ?? "page state"}${effect.count > 1 ? ` (${effect.count} times)` : ""}.`,
        { effect },
      ));
    }
  }

  for (const matcher of contract.forbid ?? []) {
    for (const effect of effects.filter((candidate) => matchEffect(matcher, candidate))) {
      violations.push(violation(
        "FORBIDDEN_EFFECT",
        `Observed an effect forbidden by the contract: ${effect.kind} ${effect.operation ?? ""} ${effect.target ?? effect.url ?? ""}`.trim(),
        { effect, matcher },
      ));
    }
  }

  for (const matcher of contract.require ?? []) {
    if (!effects.some((effect) => matchEffect(matcher, effect))) {
      violations.push(violation(
        "MISSING_EFFECT",
        `Required effect was not observed: ${JSON.stringify(matcher)}`,
        { matcher },
      ));
    }
  }

  if (contract.strictEffects === true) {
    const declared = [...(contract.allow ?? []), ...(contract.require ?? [])];
    for (const effect of effects) {
      if (!declared.some((matcher) => matchEffect(matcher, effect))) {
        violations.push(violation(
          "UNDECLARED_EFFECT",
          `Observed an undeclared effect: ${effect.kind} ${effect.operation ?? ""} ${effect.target ?? effect.url ?? ""}`.trim(),
          { effect },
        ));
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
