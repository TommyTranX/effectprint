import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "../src/config.js";

test("accepts a valid contract map", () => {
  const config = { version: 1, tools: { search: { forbid: [{ kind: "network" }] } } };
  assert.equal(validateConfig(config), config);
});

test("rejects incompatible contract versions and shapes", () => {
  assert.throws(() => validateConfig({ version: 2 }), /Unsupported config version/);
  assert.throws(() => validateConfig({ version: 1, tools: [] }), /config.tools/);
  assert.throws(() => validateConfig({ version: 1, tools: { search: { forbid: {} } } }), /must be an array/);
  assert.throws(() => validateConfig({ version: 1, surprise: true }), /Unknown field/);
  assert.throws(() => validateConfig({ version: 1, tools: { search: { execute: "yes" } } }), /must be a boolean/);
  assert.throws(() => validateConfig({ version: 1, tools: { search: { forbid: [{ mutating: "yes" }] } } }), /must be a boolean/);
});
