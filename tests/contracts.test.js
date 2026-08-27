import test from "node:test";
import assert from "node:assert/strict";
import { isMutatingEffect, matchEffect, verifyEffects } from "../src/contracts.js";

const post = {
  kind: "network",
  method: "POST",
  operation: "POST",
  target: "/api/checkout",
  url: "http://127.0.0.1/api/checkout",
  mutating: true,
  blocked: true,
};

test("read-only tools fail on attempted mutation even when blocked", () => {
  const result = verifyEffects({ annotations: { readOnlyHint: true } }, [post]);
  assert.equal(result.passed, false);
  assert.equal(result.violations[0].code, "READ_ONLY_MUTATION");
});

test("blocked is evidence, not an exemption", () => {
  assert.equal(isMutatingEffect(post), true);
  assert.equal(isMutatingEffect({ kind: "clipboard", operation: "clipboard.writeText", blocked: true }), true);
  assert.equal(isMutatingEffect({ kind: "download", operation: "anchor.download", blocked: true }), true);
  assert.equal(isMutatingEffect({ kind: "form", method: "GET", mutating: false }), false);
});

test("effect matchers support globs and semantic mutation fields", () => {
  assert.equal(matchEffect({ kind: "network", method: "POST", url: "*/api/*" }, post), true);
  assert.equal(matchEffect({ kind: "network", mutating: false }, post), false);
  assert.equal(matchEffect({ kind: "dom", blocked: false }, { kind: "dom" }), false);
  assert.equal(matchEffect("network:POST:*/checkout", post), true);
});

test("required and forbidden effects are both enforced", () => {
  const get = { kind: "network", method: "GET", operation: "GET", target: "/api/products", url: "http://localhost/api/products", mutating: false };
  const result = verifyEffects(
    { annotations: {} },
    [get, post],
    {
      require: [{ kind: "dom" }],
      forbid: [{ kind: "network", mutating: true }],
    },
  );
  assert.deepEqual(result.violations.map((item) => item.code), ["FORBIDDEN_EFFECT", "MISSING_EFFECT"]);
});

test("strict mode rejects effects that were not declared", () => {
  const dom = { kind: "dom", operation: "dom.mutate", target: "#results" };
  const result = verifyEffects(
    { annotations: {} },
    [dom],
    { allow: [{ kind: "network" }], strictEffects: true },
  );
  assert.equal(result.violations[0].code, "UNDECLARED_EFFECT");
});
