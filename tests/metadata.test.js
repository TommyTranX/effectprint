import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { VERSION } from "../src/constants.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(join(root, path), "utf8");

test("package, citation, and CodeMeta identities agree", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const codemeta = JSON.parse(await read("codemeta.json"));
  const citation = await read("CITATION.cff");
  assert.equal(packageJson.name, "effectprint");
  assert.equal(packageJson.version, VERSION);
  assert.equal(packageJson.version, codemeta.version);
  assert.match(citation, new RegExp(`version: ${packageJson.version.replaceAll(".", "\\.")}`));
  assert.equal(packageJson.repository.url, "git+https://github.com/TommyTranX/effectprint.git");
  assert.equal(codemeta.codeRepository, "https://github.com/TommyTranX/effectprint");
});

test("all JSON artifacts parse and corpus fixtures exist", async () => {
  for (const path of [
    "package.json",
    "package-lock.json",
    "codemeta.json",
    "schemas/config.schema.json",
    "schemas/report.schema.json",
    "schemas/corpus.schema.json",
    "fixtures/corpus.json",
  ]) {
    const contents = await read(path);
    assert.doesNotThrow(() => JSON.parse(contents), path);
  }
  const corpus = JSON.parse(await read("fixtures/corpus.json"));
  for (const item of corpus.cases) await access(join(root, "fixtures", item.fixture));
});

test("llms.txt local repository links resolve to files", async () => {
  const llms = await read("llms.txt");
  const pattern = /https:\/\/raw\.githubusercontent\.com\/TommyTranX\/effectprint\/main\/([^\s)]+)/g;
  const paths = [...llms.matchAll(pattern)].map((match) => match[1]);
  assert.ok(paths.length >= 10);
  for (const path of paths) await access(join(root, path));
});

test("site advertises Markdown and LLM discovery endpoints", async () => {
  const site = await read("site/index.html");
  assert.match(site, /rel="describedby" href="\/effectprint\/llms\.txt"/);
  assert.match(site, /rel="alternate" type="text\/markdown"/);
  assert.match(site, /"@type": "SoftwareSourceCode"/);
});

test("first-run surfaces use the published package or bundled action", async () => {
  const surfaces = await Promise.all([
    read("README.md"),
    read("llms.txt"),
    read("site/index.html"),
    read("site/index.md"),
    read("action.yml"),
  ]);
  assert.match(surfaces[0], /npx --yes effectprint demo/);
  assert.match(surfaces[0], /npm install --save-dev effectprint/);
  assert.match(surfaces[1], /https:\/\/www\.npmjs\.com\/package\/effectprint/);
  for (const contents of surfaces.slice(0, 4)) {
    assert.doesNotMatch(contents, /github:TommyTranX\/effectprint#/);
  }
  assert.match(surfaces[4], /\$GITHUB_ACTION_PATH/);
});
