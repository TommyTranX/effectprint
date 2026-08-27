export type EffectKind = "network" | "storage" | "cookie" | "form" | "navigation" | "dom" | "clipboard" | "download";

export interface Effect {
  kind: EffectKind | string;
  operation?: string;
  method?: string;
  target?: string;
  url?: string;
  mutating?: boolean;
  blocked?: boolean;
  crossOrigin?: boolean;
  isolated?: boolean;
  count?: number;
  source?: string;
  details?: Record<string, unknown>;
}

export interface EffectMatcher {
  kind?: string;
  operation?: string;
  method?: string;
  target?: string;
  url?: string;
  mutating?: boolean;
  blocked?: boolean;
  crossOrigin?: boolean;
  source?: string;
}

export interface ToolContract {
  input?: unknown;
  execute?: boolean;
  skip?: boolean;
  allow?: Array<EffectMatcher | string>;
  forbid?: Array<EffectMatcher | string>;
  require?: Array<EffectMatcher | string>;
  strictEffects?: boolean;
}

export interface EffectprintConfig {
  $schema?: string;
  version: 1;
  url?: string;
  tools?: Record<string, ToolContract>;
}

export interface AuditOptions {
  allowRemote?: boolean;
  browser?: "chrome" | "chrome-beta" | "chrome-canary" | "chromium";
  headed?: boolean;
  safe?: boolean;
  settleMs?: number;
  timeoutMs?: number;
  navigationTimeoutMs?: number;
  includeValues?: boolean;
  toolNames?: string[];
  browserInstance?: unknown;
}

export interface ToolResult {
  tool: string;
  title?: string | null;
  description?: string;
  annotations?: Record<string, unknown>;
  status: "passed" | "failed" | "skipped" | "error";
  effects: Effect[];
  violations: Array<{ code: string; message: string; effect?: Effect }>;
  effectFingerprint?: string;
  input?: unknown;
  output?: unknown;
  durationMs?: number;
  reason?: string;
  error?: string;
}

export interface AuditDiagnostic {
  code: string;
  message: string;
  tool?: string;
}

export interface DiscoveredTool {
  name: string;
  title: string | null;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, unknown>;
}

export interface AuditReport {
  schemaVersion: 1;
  generatedAt: string;
  webmcpSnapshot: string;
  target: string;
  safeMode: boolean;
  passed: boolean;
  summary: { discovered: number; passed: number; failed: number; skipped: number; diagnostics: number; effects: number; violations: number };
  diagnostics: AuditDiagnostic[];
  tools: ToolResult[];
}

export function defineConfig<T extends EffectprintConfig>(config: T): T;
export function findConfig(cwd?: string): Promise<string | null>;
export function loadConfig(path?: string | null, cwd?: string): Promise<{ path: string | null; config: EffectprintConfig }>;
export function validateConfig<T extends EffectprintConfig>(config: T): T;
export function auditUrl(url: string, config?: EffectprintConfig, options?: AuditOptions): Promise<AuditReport>;
export function discoverUrl(url: string, options?: AuditOptions): Promise<DiscoveredTool[]>;
export function launchAuditBrowser(options?: AuditOptions): Promise<unknown>;
export function deduplicateEffects(effects: Effect[]): Effect[];
export function fingerprintEffects(effects: Effect[], targetUrl?: string): string;
export function synthesizeInput(schema?: Record<string, unknown>): unknown;
export function matchEffect(matcher: EffectMatcher | string, effect: Effect): boolean;
export function isMutatingEffect(effect: Effect): boolean;
export function verifyEffects(tool: Record<string, unknown>, effects: Effect[], contract?: ToolContract): { passed: boolean; violations: Array<{ code: string; message: string; effect?: Effect }> };
export function renderReport(report: AuditReport, format?: "terminal" | "json" | "markdown" | "html" | "junit" | "sarif" | "badge", options?: Record<string, unknown>): string;
export const DEMO_CONFIG: EffectprintConfig;
export function startPoisonedShop(): Promise<{
  url: string;
  state: { checkoutAttempts: number; completedPurchases: number };
  close(): Promise<void>;
}>;
export const FORMATS: readonly string[];
export const VERSION: string;
export const CONTRACT_VERSION: number;
export const WEBMCP_SNAPSHOT: string;
