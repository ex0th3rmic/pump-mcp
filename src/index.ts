import type { Env } from "./env";
import { modeOf } from "./env";
import { mergeSpecs, prepareOfficialSpec, type OfficialSpec } from "./official";
import { communitySpec } from "./spec";
import { handleRequest, type FetchLike } from "./upstreams";

const VERSION = "0.1.0";

/** Official document (1.5 MB), fetched once per isolate and kept for an hour. */
let officialCache: { url: string; at: number; official: OfficialSpec; merged: Record<string, unknown> } | null = null;
const SPEC_TTL_MS = 60 * 60 * 1000;

async function loadSpec(env: Env): Promise<{ spec: Record<string, unknown>; official?: OfficialSpec }> {
  if (modeOf(env) !== "hybrid") return { spec: communitySpec };
  const url = env.PUMP_OPENAPI_URL!.trim();
  if (officialCache && officialCache.url === url && Date.now() - officialCache.at < SPEC_TTL_MS) {
    return { spec: officialCache.merged, official: officialCache.official };
  }
  const res = await fetch(url, { headers: { accept: "application/json" }, cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit);
  if (!res.ok) throw new Error(`Could not fetch PUMP_OPENAPI_URL (${res.status})`);
  const doc = (await res.json()) as Record<string, unknown>;
  const official = prepareOfficialSpec(doc);
  const merged = mergeSpecs(doc, communitySpec);
  officialCache = { url, at: Date.now(), official, merged };
  return { spec: merged, official };
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < ab.byteLength; i++) diff |= ab[i]! ^ bb[i]!;
  return diff === 0;
}

function authorized(request: Request, env: Env): boolean {
  if (!env.MCP_BEARER_TOKEN) return false;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token.length > 0 && timingSafeEqual(token, env.MCP_BEARER_TOKEN);
}

/** One data point per event: blob1 = kind ("page" | "mcp"), blob2 = path or tool name. No request details. */
function count(env: Env, kind: "page" | "mcp", what: string): void {
  try {
    env.ANALYTICS?.writeDataPoint({ blobs: [kind, what.slice(0, 64)], doubles: [1], indexes: [kind] });
  } catch {
    /* counting never breaks a request */
  }
}

/** Reads the JSON-RPC method (and tool name for tools/call) off a cloned body. */
async function mcpCallName(request: Request): Promise<string | null> {
  try {
    const msg = (await request.clone().json()) as { method?: string; params?: { name?: string } };
    if (msg.method === "tools/call") return typeof msg.params?.name === "string" ? msg.params.name : "tools/call";
    return null;
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const DESCRIPTION = [
  "pump.fun over Code Mode: write JavaScript that calls `codemode.spec()` to inspect the OpenAPI",
  "document and `codemode.request({ method, path, query, body })` to hit it. Filter and aggregate in",
  "code; return only what the user needs. Official Developer API routes (users, callouts, posts,",
  "leaderboards, positions) are rate limited (2 rps, 50k/day) and need the operator's pf_live_ key;",
  "batch with the /users/batch and multi-id endpoints instead of looping. `/curve/{mint}` and `/rpc`",
  "read chain state directly. `/trade` builds an unsigned buy, sell or create transaction with",
  "pump.fun's official SDK for the user's wallet to sign; nothing moves until they sign.",
  "`/metadata` pins a new coin's image and metadata to IPFS and returns the uri create needs.",
  "Present results as 'Data from pump.fun'.",
].join(" ");

const LLMS_TXT = (origin: string) => `# pump-mcp

Self-hosted Model Context Protocol (MCP) server for pump.fun on Cloudflare Workers.
Data from pump.fun. Trades are built unsigned; the user's wallet signs.

## Endpoint

- MCP (streamable HTTP): POST ${origin}/mcp
- Auth: every request needs the header \`Authorization: Bearer <MCP_BEARER_TOKEN>\` (ask the operator for the token)
- Status: GET ${origin}/health
- OpenAPI document of everything the tools can call: GET ${origin}/openapi.json
- Showcase curve, no auth: GET ${origin}/api/showcase

## Tools

Two tools, Code Mode style. Instead of one tool per endpoint, write JavaScript against the OpenAPI document.

- search: run \`codemode.spec()\` to inspect the OpenAPI document and find routes.
- execute: run an async function that calls \`codemode.request({ method, path, query, body })\` as many times as needed, filters and joins in code, and returns only what the user needs. Many requests per call is the point: run them with Promise.all.

Example execute body:

    async () => {
      const mint = "<MINT>";
      const curve = await codemode.request({ method: "GET", path: \`/curve/\${mint}\`, query: { buyAmount: 0.5 } });
      return { price: curve.priceInQuote, progress: curve.graduationProgress, buy: curve.buyQuote };
    }

## Routes

- GET /curve/{mint}: bonding curve read straight from Solana. Price, market cap, graduation progress, reserves, buy/sell quotes (query buyAmount, sellTokens). No pump.fun key needed.
- POST /rpc: allow-listed Solana JSON-RPC methods (getAccountInfo, getBalance, getTokenLargestAccounts, getTokenSupply, getSignaturesForAddress, getTransaction, simulateTransaction, sendTransaction, ...). Body: { method, params }.
- POST /trade: builds an UNSIGNED transaction with pump.fun's official SDK from live chain state, for the given wallet to sign. Buy and sell route to the bonding curve, or to the PumpSwap pool once a coin has graduated. Body: { publicKey, action: "buy"|"sell"|"create", mint, amount, denominatedInSol, slippage, priorityFee, pool: "auto" }. Sell amounts can be a percentage such as "100%". Create takes tokenMetadata { name, symbol, uri } and no mint: the server generates the mint, signs with it once, and returns its address. (POST /trade/local is an alias.)
- POST /metadata: pins a new coin's image (inline base64 data URL) and metadata JSON to IPFS; returns { uri } for create. Body: { name, symbol, description, image, website, twitter, telegram }.
- Official pump.fun Developer API routes (users, following, posts, callouts, leaderboards, positions, trades): read-only social data. Available only when the operator has configured PUMP_API_KEY; otherwise they fail with NOT_CONFIGURED. Rate limited (2 rps, 50k/day).

## Rules

- Present results as "Data from pump.fun".
- Do not retain API data for training. Cache at most 24 hours.
- Final responses are truncated around 6k tokens: filter in code, return small objects.

## Questions

Open an issue: https://github.com/ex0th3rmic/pump-mcp/issues (templates for questions, bugs, features). Source and contributing guide at https://github.com/ex0th3rmic/pump-mcp.
`;

export interface HandlerDeps {
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: FetchLike;
}

export function createHandler(deps: HandlerDeps = {}) {
  return {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        version: VERSION,
        mode: modeOf(env),
        officialKey: Boolean(env.PUMP_API_KEY),
        rpc: Boolean(env.RPC_URL),
        metadataUpload: Boolean(env.PINATA_JWT),
        devBuyInCreate: Boolean(env.LOOKUP_TABLES && env.LOOKUP_TABLES.trim()),
        auth: Boolean(env.MCP_BEARER_TOKEN),
        cluster: env.SOLANA_CLUSTER === "devnet" ? "devnet" : "mainnet-beta",
      });
    }

    if (url.pathname === "/llms.txt") {
      return new Response(LLMS_TXT(url.origin), { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
    }

    // Public, cached read of one operator-chosen coin so the web app can show a live curve on load
    // without a bearer token. Fixed mint + 20s cache: no way to turn it into a free RPC proxy.
    if (url.pathname === "/api/showcase") {
      if (request.method !== "GET") return json({ error: "NOT_FOUND" }, 404);
      const mint = env.SHOWCASE_MINT?.trim();
      if (!mint || !env.RPC_URL) return json({ error: "NOT_CONFIGURED", message: "Set SHOWCASE_MINT and RPC_URL to enable the showcase curve" }, 404);
      const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
      const key = new Request(`${url.origin}/api/showcase`);
      const hit = await cache?.match(key);
      // A response marked as a cache hit leaves the edge with the zone's browser TTL (hours), overriding ours.
      // Rebuild it without the hit markers so the 20s lifetime survives.
      if (hit) {
        const headers = new Headers(hit.headers);
        for (const name of ["cf-cache-status", "age", "expires", "last-modified", "etag"]) headers.delete(name);
        headers.set("cache-control", "public, max-age=20");
        return new Response(hit.body, { status: hit.status, headers });
      }
      try {
        const curve = await handleRequest({ method: "GET", path: `/curve/${mint}`, query: { buyAmount: 0.5 } }, env, { fetchImpl: deps.fetchImpl });
        // asOf survives the edge cache, so clients can show the chain read's real age, not the fetch time.
        const res = json({ ...(curve as Record<string, unknown>), asOf: new Date().toISOString() }, 200, { "cache-control": "public, max-age=20" });
        if (cache) ctx.waitUntil(cache.put(key, res.clone()));
        return res;
      } catch (e) {
        return json({ error: "UPSTREAM", message: e instanceof Error ? e.message : String(e) }, 502);
      }
    }

    if (url.pathname === "/openapi.json") {
      const { spec } = await loadSpec(env);
      return json(spec, 200, { "cache-control": "public, max-age=300" });
    }

    if (url.pathname !== "/mcp") {
      const appPage = url.pathname === "/app" || url.pathname.startsWith("/app/");
      const publicPage = url.pathname === "/" || appPage;
      const staticAsset = /\.[a-z0-9]+$/i.test(url.pathname);
      if (env.ASSETS && (request.method === "GET" || request.method === "HEAD") && (publicPage || staticAsset)) {
        if (request.method === "GET" && !staticAsset) count(env, "page", url.pathname);
        const assetRequest = appPage ? new Request(new URL("/", url.origin), request) : request;
        return env.ASSETS.fetch(assetRequest);
      }
      return json({ error: "NOT_FOUND" }, 404);
    }

    if (!env.MCP_BEARER_TOKEN) {
      return json({ error: "NOT_CONFIGURED", message: "Set the MCP_BEARER_TOKEN secret before exposing /mcp" }, 503);
    }
    if (!authorized(request, env)) {
      count(env, "mcp", "unauthorized");
      return json({ error: "UNAUTHORIZED" }, 401, { "www-authenticate": 'Bearer realm="pump-mcp"' });
    }
    if (env.ANALYTICS && request.method === "POST") {
      const name = await mcpCallName(request);
      if (name) count(env, "mcp", name);
    }

    // Loaded lazily: these modules import `cloudflare:workers`, which only exists inside workerd.
    const [{ DynamicWorkerExecutor }, { openApiMcpServer }, { createLegacyMcpHandler }] = await Promise.all([
      import("@cloudflare/codemode"),
      import("@cloudflare/codemode/mcp"),
      import("agents/mcp"),
    ]);
    const { spec, official } = await loadSpec(env);
    const server = openApiMcpServer({
      spec,
      executor: new DynamicWorkerExecutor({ loader: env.LOADER, timeout: 60_000, globalOutbound: null }),
      request: (opts) => handleRequest(opts, env, { official }),
      name: "pump",
      version: VERSION,
      description: DESCRIPTION,
    });
    return createLegacyMcpHandler(server, { route: "/mcp" })(request, env, ctx);
  },
  } satisfies ExportedHandler<Env>;
}

export default createHandler();
