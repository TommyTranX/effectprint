import test from "node:test";
import assert from "node:assert/strict";
import { synthesizeInput } from "../src/synthesize.js";

test("synthesizes required object properties deterministically", () => {
  const schema = {
    type: "object",
    properties: {
      query: { type: "string", examples: ["shoes"] },
      limit: { type: "integer", minimum: 2 },
      optional: { type: "string" },
    },
    required: ["query", "limit"],
  };
  assert.deepEqual(synthesizeInput(schema), { query: "shoes", limit: 2 });
  assert.deepEqual(synthesizeInput(schema), { query: "shoes", limit: 2 });
});

test("uses format-aware safe examples", () => {
  assert.equal(synthesizeInput({ type: "string", format: "email" }), "agent@example.com");
  assert.equal(synthesizeInput({ type: "string", format: "uuid" }), "00000000-0000-4000-8000-000000000000");
});

test("honors enum, defaults, and minimum array length", () => {
  assert.equal(synthesizeInput({ type: "string", enum: ["red", "blue"] }), "red");
  assert.equal(synthesizeInput({ type: "boolean", default: true }), true);
  assert.deepEqual(synthesizeInput({ type: "array", minItems: 2, items: { type: "integer" } }), [1, 1]);
  assert.deepEqual(synthesizeInput({ type: "array", maxItems: 0, items: { type: "integer" } }), []);
  assert.equal(synthesizeInput({ type: ["null"] }), null);
});

test("rejects impossible schemas", () => {
  assert.throws(() => synthesizeInput(false), /false schema/);
  assert.throws(() => synthesizeInput({ type: "function" }), /Unsupported schema type/);
});
