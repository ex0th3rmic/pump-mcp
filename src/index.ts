import type { Env } from "./env";
import { modeOf } from "./env";
import { mergeSpecs, prepareOfficialSpec, type OfficialSpec } from "./official";
import { communitySpec } from "./spec";
import { handleRequest } from "./upstreams";

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

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

const DESCRIPTION = [
  "pump.fun over Code Mode: write JavaScript that calls `codemode.spec()` to inspect the OpenAPI",
  "document and `codemode.request({ method, path, query, body })` to hit it. Filter and aggregate in",
  "code; return only what the user needs. Official Developer API routes (users, callouts, posts,",
  "leaderboards, positions) are rate limited (2 rps, 50k/day) and need the operator's pf_live_ key;",
  "batch with the /users/batch and multi-id endpoints instead of looping. `/curve/{mint}` and `/rpc`",
  "read chain state directly. `/trade/local` returns an unsigned transaction for the user's wallet to",
  "sign. `/trade/lightning` moves real funds and only works when the operator configured it.",
  "Present results as 'Data from pump.fun'.",
].join(" ");

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        version: VERSION,
        mode: modeOf(env),
        officialKey: Boolean(env.PUMP_API_KEY),
        rpc: Boolean(env.RPC_URL),
        lightning: Boolean(env.PUMPPORTAL_API_KEY),
        auth: Boolean(env.MCP_BEARER_TOKEN),
      });
    }

    if (url.pathname === "/openapi.json") {
      const { spec } = await loadSpec(env);
      return json(spec, 200, { "cache-control": "public, max-age=300" });
    }

    if (url.pathname !== "/mcp") {
      if (env.ASSETS && (request.method === "GET" || request.method === "HEAD")) return env.ASSETS.fetch(request);
      return json({ error: "NOT_FOUND" }, 404);
    }

    if (!env.MCP_BEARER_TOKEN) {
      return json({ error: "NOT_CONFIGURED", message: "Set the MCP_BEARER_TOKEN secret before exposing /mcp" }, 503);
    }
    if (!authorized(request, env)) {
      return json({ error: "UNAUTHORIZED" }, 401, { "www-authenticate": 'Bearer realm="pump-mcp"' });
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
