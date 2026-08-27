import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { LOCAL_HOSTS, SAFE_HTTP_METHODS } from "./constants.js";

export function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function stableStringify(value, space = 0) {
  const seen = new WeakSet();
  const normalize = (item) => {
    if (item === null || typeof item !== "object") return item;
    if (seen.has(item)) throw new TypeError("Cannot serialize a circular value");
    seen.add(item);
    if (Array.isArray(item)) {
      const result = item.map(normalize);
      seen.delete(item);
      return result;
    }
    const result = {};
    for (const key of Object.keys(item).sort()) {
      const normalized = normalize(item[key]);
      if (normalized !== undefined) result[key] = normalized;
    }
    seen.delete(item);
    return result;
  };
  return JSON.stringify(normalize(value), null, space);
}

export function hash(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 16);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function escapeXml(value) {
  return escapeHtml(sanitizeTerminal(value)).replaceAll("&#039;", "&apos;");
}

export function sanitizeTerminal(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/[\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/\s*[\r\n]+\s*/g, " ");
}

export function escapeMarkdown(value) {
  return sanitizeTerminal(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("`", "&#96;")
    .replace(/([*#[\]{}()<>|+.!-])/g, "\\$1")
    .replace(/\r?\n/g, " ");
}

export function redactUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl));
    if (url.username) url.username = "redacted";
    if (url.password) url.password = "redacted";
    for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, "REDACTED");
    url.hash = "";
    return url.href;
  } catch {
    const [path, query] = String(rawUrl ?? "").split("?", 2);
    if (query === undefined) return path;
    const params = new URLSearchParams(query);
    for (const key of [...params.keys()]) params.set(key, "REDACTED");
    return `${path}?${params}`;
  }
}

export function globMatch(pattern, value) {
  if (pattern === undefined || pattern === null || pattern === "*") return true;
  const escaped = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replaceAll("?", ".");
  return new RegExp(`^${escaped}$`, "i").test(String(value));
}

export function isLocalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return LOCAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function isMutatingHttpMethod(method) {
  return !SAFE_HTTP_METHODS.has(String(method ?? "GET").toUpperCase());
}

export async function writeTextFile(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
}

export function truncate(value, length = 160) {
  const text = String(value ?? "");
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}

export function nowIso() {
  return new Date().toISOString();
}
