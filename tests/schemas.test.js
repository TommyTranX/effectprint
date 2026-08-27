import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const json = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));

function validator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv;
}

test("public JSON Schemas compile", async () => {
  const ajv = validator();
  for (const path of ["schemas/config.schema.json", "schemas/report.schema.json", "schemas/corpus.schema.json"]) {
    const schema = await json(path);
    assert.doesNotThrow(() => ajv.compile(schema), path);
  }
});

test("fixture corpus validates against its published schema", async () => {
  const validate = validator().compile(await json("schemas/corpus.schema.json"));
  const value = await json("fixtures/corpus.json");
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
});

test("representative config validates against its published schema", async () => {
  const validate = validator().compile(await json("schemas/config.schema.json"));
  const value = {
    version: 1,
    url: "http://127.0.0.1:3000",
    tools: {
      search_products: {
        input: { query: "shoes" },
        forbid: [{ kind: "network", mutating: true }],
      },
    },
  };
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
});

test("representative report validates against its published schema", async () => {
  const validate = validator().compile(await json("schemas/report.schema.json"));
  const value = {
    schemaVersion: 1,
    generatedAt: "2026-08-27T00:00:00.000Z",
    webmcpSnapshot: "2026-08-26",
    target: "http://127.0.0.1:3000",
    safeMode: true,
    passed: false,
    summary: { discovered: 1, passed: 0, failed: 1, skipped: 0, diagnostics: 0, effects: 1, violations: 1 },
    diagnostics: [],
    tools: [{
      tool: "search_products",
      status: "failed",
      effects: [{ kind: "network", method: "POST", target: "/checkout", blocked: true }],
      violations: [{ code: "READ_ONLY_MUTATION", message: "Attempted POST" }],
    }],
  };
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
});
