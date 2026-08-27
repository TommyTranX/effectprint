import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CONTRACT_VERSION } from "./constants.js";
import { isPlainObject } from "./utils.js";

const CANDIDATES = [".effectprint.json"];
const MAX_CONFIG_BYTES = 1_000_000;
const MAX_TOOL_CONTRACTS = 200;
const MAX_MATCHERS_PER_FIELD = 200;

async function exists(path) {
  try {
    await access(path, fsConstants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function defineConfig(config) {
  return config;
}

function rejectUnknownKeys(value, allowed, location) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Unknown field ${location}.${key}`);
  }
}

function validateMatcher(matcher, location) {
  if (typeof matcher === "string") {
    if (!matcher.length) throw new Error(`${location} must not be empty`);
    return;
  }
  if (!isPlainObject(matcher) || Object.keys(matcher).length === 0) {
    throw new Error(`${location} must be a non-empty string or object`);
  }
  const stringFields = new Set(["kind", "operation", "method", "target", "url", "source"]);
  const booleanFields = new Set(["mutating", "blocked", "crossOrigin"]);
  rejectUnknownKeys(matcher, new Set([...stringFields, ...booleanFields]), location);
  for (const field of stringFields) {
    if (matcher[field] !== undefined && typeof matcher[field] !== "string") {
      throw new Error(`${location}.${field} must be a string`);
    }
  }
  for (const field of booleanFields) {
    if (matcher[field] !== undefined && typeof matcher[field] !== "boolean") {
      throw new Error(`${location}.${field} must be a boolean`);
    }
  }
}

export async function findConfig(cwd = process.cwd()) {
  for (const name of CANDIDATES) {
    const candidate = resolve(cwd, name);
    if (await exists(candidate)) return candidate;
  }
  return null;
}

export function validateConfig(config) {
  if (!isPlainObject(config)) throw new Error("Effectprint config must export an object");
  rejectUnknownKeys(config, new Set(["$schema", "version", "url", "tools"]), "config");
  if (config.version !== CONTRACT_VERSION) {
    throw new Error(`Unsupported config version ${config.version}; expected ${CONTRACT_VERSION}`);
  }
  if (config.$schema !== undefined && typeof config.$schema !== "string") {
    throw new Error("config.$schema must be a string");
  }
  if (config.url !== undefined && typeof config.url !== "string") {
    throw new Error("config.url must be a string");
  }
  if (config.tools !== undefined && !isPlainObject(config.tools)) {
    throw new Error("config.tools must be an object keyed by tool name");
  }
  if (Object.keys(config.tools ?? {}).length > MAX_TOOL_CONTRACTS) {
    throw new Error(`Effectprint configs are limited to ${MAX_TOOL_CONTRACTS} tool contracts`);
  }
  for (const [name, contract] of Object.entries(config.tools ?? {})) {
    if (!name.length) throw new Error("Tool contract names must not be empty");
    if (!isPlainObject(contract)) throw new Error(`Contract for ${name} must be an object`);
    rejectUnknownKeys(
      contract,
      new Set(["input", "execute", "skip", "allow", "forbid", "require", "strictEffects"]),
      `config.tools.${name}`,
    );
    for (const field of ["execute", "skip", "strictEffects"]) {
      if (contract[field] !== undefined && typeof contract[field] !== "boolean") {
        throw new Error(`Contract ${name}.${field} must be a boolean`);
      }
    }
    for (const field of ["allow", "forbid", "require"]) {
      if (contract[field] !== undefined && !Array.isArray(contract[field])) {
        throw new Error(`Contract ${name}.${field} must be an array`);
      }
      if ((contract[field]?.length ?? 0) > MAX_MATCHERS_PER_FIELD) {
        throw new Error(`Contract ${name}.${field} exceeds the ${MAX_MATCHERS_PER_FIELD} matcher limit`);
      }
      contract[field]?.forEach((matcher, index) => validateMatcher(matcher, `config.tools.${name}.${field}[${index}]`));
    }
  }
  return config;
}

export async function loadConfig(path, cwd = process.cwd()) {
  const resolved = path ? resolve(cwd, path) : await findConfig(cwd);
  if (!resolved) return { path: null, config: { version: CONTRACT_VERSION, tools: {} } };
  const extension = extname(resolved);
  let config;
  if (extension === ".json") {
    const contents = await readFile(resolved, "utf8");
    if (Buffer.byteLength(contents) > MAX_CONFIG_BYTES) {
      throw new Error(`Effectprint config exceeds the ${MAX_CONFIG_BYTES} byte limit`);
    }
    config = JSON.parse(contents);
  } else {
    if (!path) throw new Error("Executable JavaScript configs must be passed explicitly with --config");
    const module = await import(`${pathToFileURL(resolved).href}?effectprint=${Date.now()}`);
    config = module.default ?? module.config;
  }
  return { path: resolved, config: validateConfig(config) };
}
