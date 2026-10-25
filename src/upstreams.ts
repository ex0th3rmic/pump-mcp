import type { RequestOptions } from "@cloudflare/codemode/mcp";
import type { Env } from "./env";
import { modeOf } from "./env";
import { bondingCurveAddress, decodeBondingCurve, describeCurve, isBase58Pubkey } from "./curve";
import type { OfficialSpec } from "./official";
import { matchOfficialPath } from "./official";
import { buildTrade, TradeError } from "./tx";
import { MetadataError, pinMetadata } from "./metadata";

/**
 * Host-side handler for `codemode.request()` calls coming out of the sandbox.
 *
 * Runs in the trusted Worker, never in the sandbox: this is the only place secrets (API keys,
 * keyed RPC URL) are attached. Anything not matched by the route table is rejected, so
 * model-written code cannot turn this into an open proxy.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "NOT_CONFIGURED" | "FORBIDDEN" | "UPSTREAM" | "BAD_REQUEST",
    readonly status?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

const DEFAULT_FRONTEND = "https://frontend-api-v3.pump.fun";

type Query = Record<string, string | number | boolean | undefined>;

function withQuery(url: URL, query: Query | undefined): URL {
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  return url;
}

function stripSlash(origin: string): string {
  return origin.replace(/\/+$/, "");
}

async function readBody(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const ct = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (ct.includes("application/json")) return JSON.parse(text);
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function fetchJson(fetchImpl: FetchLike, url: string, init: RequestInit, label: string): Promise<unknown> {
  const res = await fetchImpl(url, init);
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    throw new UpstreamError(`${label} responded ${res.status}: ${detail}`, "UPSTREAM", res.status);
  }
  return readBody(res);
}


/** Paths under the frontend API that sandbox code may read. Everything else is refused. */
const FRONTEND_GET = [
  /^\/coins$/,
  /^\/coins\/search$/,
  /^\/coins\/latest$/,
  /^\/coins\/currently-live$/,
  /^\/coins\/king-of-the-hill$/,
  /^\/coins\/user-created-coins\/[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  /^\/coins\/[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  /^\/trades\/all\/[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  /^\/trades\/latest$/,
  /^\/candlesticks\/[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  /^\/replies\/[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  /^\/balances\/[1-9A-HJ-NP-Za-km-z]{32,44}$/,
  /^\/sol-price$/,
];

function lookupTablesOf(env: Env): string[] {
  return (env.LOOKUP_TABLES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function communityRequest(opts: RequestOptions, env: Env, fetchImpl: FetchLike): Promise<unknown> {
  const path = opts.path;
  if (!path.startsWith("/") || path.includes("..") || path.includes("://")) {
    throw new UpstreamError("path must be an absolute API path", "BAD_REQUEST");
  }
  const method = opts.method ?? "GET";

  // Market data (unofficial frontend API)
  if (method === "GET" && FRONTEND_GET.some((re) => re.test(path))) {
    const origin = stripSlash(env.PUMP_FRONTEND_API_ORIGIN || DEFAULT_FRONTEND);
    const url = withQuery(new URL(origin + path), opts.query);
    return fetchJson(fetchImpl, url.toString(), { method: "GET", headers: { accept: "application/json" } }, "pump.fun frontend API");
  }

  // Trading: unsigned transactions built with pump.fun's official SDK. /trade/local is an alias
  // kept for code written against the earlier PumpPortal-backed route.
  if (method === "POST" && (path === "/trade" || path === "/trade/local")) {
    try {
      return await buildTrade(opts.body, { rpcUrl: env.RPC_URL, fetchImpl, lookupTables: lookupTablesOf(env) });
    } catch (e) {
      if (e instanceof TradeError) throw new UpstreamError(e.message, e.code, e.status);
      throw e;
    }
  }

  // Coin metadata: pin the image and JSON to IPFS, return the uri create takes.
  if (method === "POST" && path === "/metadata") {
    try {
      return await pinMetadata(opts.body, { jwt: env.PINATA_JWT, gateway: env.IPFS_GATEWAY, fetchImpl });
    } catch (e) {
      if (e instanceof MetadataError) throw new UpstreamError(e.message, e.code, e.status);
      throw e;
    }
  }

  // On-chain bonding curve (works without any pump.fun HTTP API)
  const curveMatch = method === "GET" ? /^\/curve\/([1-9A-HJ-NP-Za-km-z]{32,44})$/.exec(path) : null;
  if (curveMatch) {
    if (!env.RPC_URL) throw new UpstreamError("On-chain reads are disabled: RPC_URL is not configured on this server", "NOT_CONFIGURED");
    const mint = curveMatch[1]!;
    if (!isBase58Pubkey(mint)) throw new UpstreamError("mint is not a valid base58 public key", "BAD_REQUEST");
    const address = bondingCurveAddress(mint);
    const payload = { jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [address, { encoding: "base64", commitment: "confirmed" }] };
    const json = (await fetchJson(
      fetchImpl,
      env.RPC_URL,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) },
      "Solana RPC",
    )) as { result?: { value: { data: [string, string]; owner: string } | null }; error?: { code: number; message: string } };
    if (json.error) throw new UpstreamError(`RPC error ${json.error.code}: ${json.error.message}`, "UPSTREAM");
    const value = json.result?.value;
    if (!value) throw new UpstreamError(`No bonding curve account for ${mint} (not a pump.fun coin, or wrong cluster)`, "NOT_FOUND", 404);
    const bytes = Uint8Array.from(atob(value.data[0]), (ch) => ch.charCodeAt(0));
    const q = opts.query ?? {};
    const num = (v: unknown) => (v === undefined ? undefined : Number(v));
    return describeCurve(mint, address, decodeBondingCurve(bytes), { buyAmount: num(q.buyAmount), sellTokens: num(q.sellTokens) });
  }

  // Solana JSON-RPC passthrough
  if (method === "POST" && path === "/rpc") {
    if (!env.RPC_URL) throw new UpstreamError("RPC is disabled: RPC_URL is not configured on this server", "NOT_CONFIGURED");
    const b = (opts.body ?? {}) as { method?: unknown; params?: unknown };
    const allowed = (env.RPC_ALLOWED_METHODS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (typeof b.method !== "string" || !allowed.includes(b.method)) {
      throw new UpstreamError(`RPC method not allowed. Allowed: ${allowed.join(", ")}`, "FORBIDDEN");
    }
    const payload = { jsonrpc: "2.0", id: 1, method: b.method, params: Array.isArray(b.params) ? b.params : [] };
    const json = (await fetchJson(
      fetchImpl,
      env.RPC_URL,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) },
      "Solana RPC",
    )) as { result?: unknown; error?: { code: number; message: string } };
    if (json.error) throw new UpstreamError(`RPC error ${json.error.code}: ${json.error.message}`, "UPSTREAM");
    return json.result ?? null;
  }

  throw new UpstreamError(`No route for ${method} ${path}. Call codemode.spec() to see the available paths.`, "NOT_FOUND");
}

/**
 * Official pump.fun Developer API: forward verbatim with the organisation key attached. Errors keep
 * pump.fun's envelope (`error` code such as API_KEY_RATE_LIMITED, `retryAfterMs`) so the model can
 * branch on it.
 */
async function officialRequest(opts: RequestOptions, env: Env, apiOrigin: string, fetchImpl: FetchLike): Promise<unknown> {
  if (!env.PUMP_API_KEY) {
    throw new UpstreamError(
      "Official pump.fun API routes need PUMP_API_KEY (a pf_live_ key from https://developers.pump.fun, approved organisations only). The on-chain, RPC and trading routes work without it.",
      "NOT_CONFIGURED",
    );
  }
  const url = withQuery(new URL(stripSlash(apiOrigin) + opts.path), opts.query);
  const headers: Record<string, string> = { accept: "application/json", authorization: `Bearer ${env.PUMP_API_KEY}` };
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    if (opts.rawBody) {
      body = opts.body as BodyInit;
      if (opts.contentType) headers["content-type"] = opts.contentType;
    } else {
      body = JSON.stringify(opts.body);
      headers["content-type"] = opts.contentType ?? "application/json";
    }
  }
  const res = await fetchImpl(url.toString(), { method: opts.method ?? "GET", headers, body });
  if (!res.ok) {
    const text = await res.text();
    let envelope: unknown = text.slice(0, 800);
    try {
      envelope = JSON.parse(text);
    } catch {
      /* plain reason phrase */
    }
    const retry = res.headers.get("retry-after");
    const detail = typeof envelope === "string" ? envelope : JSON.stringify(envelope);
    throw new UpstreamError(`pump.fun API ${res.status}${retry ? ` (retry after ${retry}s)` : ""}: ${detail}`, "UPSTREAM", res.status);
  }
  return readBody(res);
}

export interface RouterDeps {
  fetchImpl?: FetchLike;
  /** Prepared official spec (hybrid mode). Paths it declares go to the official API. */
  official?: OfficialSpec;
}

export async function handleRequest(opts: RequestOptions, env: Env, deps: RouterDeps = {}): Promise<unknown> {
  const fetchImpl = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  if (!opts.path.startsWith("/") || opts.path.includes("://") || opts.path.includes("..")) {
    throw new UpstreamError("path must be an absolute API path", "BAD_REQUEST");
  }
  if (modeOf(env) === "hybrid" && deps.official && matchOfficialPath(deps.official.matchers, opts.path)) {
    const origin = env.PUMP_API_ORIGIN || deps.official.origin;
    if (!origin) throw new UpstreamError("Official API origin unknown: set PUMP_API_ORIGIN", "NOT_CONFIGURED");
    return officialRequest(opts, env, origin, fetchImpl);
  }
  return communityRequest(opts, env, fetchImpl);
}
