import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findConfig, loadConfig } from "../src/config.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const cli = join(root, "bin", "effectprint.js");

test("version matches package metadata", async () => {
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const result = spawnSync(process.execPath, [cli, "--version"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), packageJson.version);
});

test("help is pipe-safe and advertises the JSON default", () => {
  const result = spawnSync(process.execPath, [cli, "--help"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /auto-detect \.effectprint\.json/);
  assert.doesNotMatch(result.stdout, /\u001b\[/);
});

test("init creates valid JSON without overwriting", async () => {
  const directory = await mkdtemp(join(tmpdir(), "effectprint-cli-"));
  try {
    const first = spawnSync(process.execPath, [cli, "init"], { cwd: directory, encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    const config = JSON.parse(await readFile(join(directory, ".effectprint.json"), "utf8"));
    assert.equal(config.version, 1);
    const second = spawnSync(process.execPath, [cli, "init"], { cwd: directory, encoding: "utf8" });
    assert.equal(second.status, 2);
    assert.match(second.stderr, /Refusing to overwrite/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("only JSON is auto-detected; JavaScript requires an explicit path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "effectprint-config-"));
  try {
    await writeFile(join(directory, "effectprint.config.mjs"), "export default { version: 1, tools: {} };\n");
    assert.equal(await findConfig(directory), null);
    const loaded = await loadConfig("effectprint.config.mjs", directory);
    assert.equal(loaded.config.version, 1);
    await writeFile(join(directory, ".effectprint.json"), '{"version":1,"tools":{}}\n');
    assert.equal(await findConfig(directory), join(directory, ".effectprint.json"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
