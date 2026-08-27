export const PACKAGE_NAME = "effectprint";
export const VERSION = "0.2.0";
export const CONTRACT_VERSION = 1;
export const WEBMCP_SNAPSHOT = "2026-08-26";

export const EXIT = Object.freeze({
  pass: 0,
  violation: 1,
  usage: 2,
});

export const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const DEFAULT_OPTIONS = Object.freeze({
  browser: "chrome",
  headed: false,
  safe: true,
  timeoutMs: 5_000,
  navigationTimeoutMs: 15_000,
  settleMs: 150,
  includeValues: false,
});
