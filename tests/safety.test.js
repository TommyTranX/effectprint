import test from "node:test";
import assert from "node:assert/strict";
import { auditUrl, deduplicateEffects, discoverUrl, fingerprintEffects } from "../src/browser/audit.js";
import { stableStringify } from "../src/utils.js";

test("remote audits and discovery are refused before browser launch", async () => {
  await assert.rejects(() => auditUrl("https://example.com"), /Remote targets are disabled/);
  await assert.rejects(() => discoverUrl("https://example.com"), /Remote targets are disabled/);
});

test("effect grouping ignores timestamps but preserves occurrence counts", () => {
  const effects = deduplicateEffects([
    { at: 1, kind: "network", method: "POST", target: "/checkout" },
    { at: 2, kind: "network", method: "POST", target: "/checkout" },
  ]);
  assert.deepEqual(effects, [{ kind: "network", method: "POST", target: "/checkout", count: 2 }]);
});

test("effect fingerprints normalize the audited target origin", () => {
  const first = [{ kind: "network", method: "GET", url: "http://127.0.0.1:41001/api/items" }];
  const second = [{ kind: "network", method: "GET", url: "http://127.0.0.1:52002/api/items" }];
  assert.equal(
    fingerprintEffects(first, "http://127.0.0.1:41001"),
    fingerprintEffects(second, "http://127.0.0.1:52002"),
  );
});

test("effect fingerprints are independent of capture order and object key order", () => {
  const left = [
    { kind: "dom", target: "#results" },
    { method: "GET", kind: "network", target: "/products" },
  ];
  const right = [
    { target: "/products", kind: "network", method: "GET" },
    { target: "#results", kind: "dom" },
  ];
  assert.equal(fingerprintEffects(left), fingerprintEffects(right));
});

test("stable serialization permits repeated non-circular references", () => {
  const shared = { value: 1 };
  assert.equal(stableStringify([shared, shared]), '[{"value":1},{"value":1}]');
});
