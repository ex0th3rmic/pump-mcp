import { describe, expect, test } from "bun:test";
import type { Env } from "../src/env";
import { handleRequest, UpstreamError, type FetchLike } from "../src/upstreams";
import { matchOfficialPath, mergeSpecs, prepareOfficialSpec } from "../src/official";
import { communitySpec } from "../src/spec";

const MINT = "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump";
const WALLET = "CttCkrcNtFfVsGSChFpYTJpYwkxJcyfigu91a7io6EzS";

type Call = { url: string; init?: RequestInit };

function mockFetch(respond: (url: string, init?: RequestInit) => Response | Promise<Response>): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { fetchImpl, calls };
}

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const baseEnv = (): Env =>
  ({
    LOADER: {} as WorkerLoader,
    MCP_BEARER_TOKEN: "t",
    PUMP_FRONTEND_API_ORIGIN: "https://frontend.test",
    PUMPPORTAL_ORIGIN: "https://portal.test/",
    RPC_ALLOWED_METHODS: "getAccountInfo, sendTransaction",
  }) as Env;

describe("community mode", () => {
  test("GET /coins forwards to the frontend API with query params, dropping undefined", async () => {
    const { fetchImpl, calls } = mockFetch(() => jsonRes([{ mint: MINT }]));
    const out = await handleRequest(
      { method: "GET", path: "/coins", query: { limit: 5, sort: "market_cap", includeNsfw: false, offset: undefined } },
      baseEnv(),
      { fetchImpl },
    );
    expect(out).toEqual([{ mint: MINT }]);
    const u = new URL(calls[0]!.url);
    expect(u.origin + u.pathname).toBe("https://frontend.test/coins");
    expect(u.searchParams.get("limit")).toBe("5");
    expect(u.searchParams.get("includeNsfw")).toBe("false");
    expect(u.searchParams.has("offset")).toBe(false);
  });

  test("GET /coins/{mint} and /trades/all/{mint} route for base58 mints only", async () => {
    const { fetchImpl, calls } = mockFetch(() => jsonRes({}));
    await handleRequest({ method: "GET", path: `/coins/${MINT}` }, baseEnv(), { fetchImpl });
    await handleRequest({ method: "GET", path: `/trades/all/${MINT}`, query: { limit: 200 } }, baseEnv(), { fetchImpl });
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([`/coins/${MINT}`, `/trades/all/${MINT}`]);
    await expect(handleRequest({ method: "GET", path: "/coins/not-a-mint!" }, baseEnv(), { fetchImpl })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("unknown paths, traversal and absolute URLs are refused before any fetch", async () => {
    const { fetchImpl, calls } = mockFetch(() => jsonRes({}));
    for (const path of ["/admin", "/coins/../x", "/https://evil.test", "coins"]) {
      await expect(handleRequest({ method: "GET", path }, baseEnv(), { fetchImpl })).rejects.toBeInstanceOf(UpstreamError);
    }
    await expect(handleRequest({ method: "DELETE", path: "/coins" }, baseEnv(), { fetchImpl })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(calls.length).toBe(0);
  });

  test("upstream non-2xx becomes an UpstreamError carrying the status", async () => {
    const { fetchImpl } = mockFetch(() => new Response("blocked", { status: 403 }));
    await expect(handleRequest({ method: "GET", path: "/sol-price" }, baseEnv(), { fetchImpl })).rejects.toMatchObject({ code: "UPSTREAM", status: 403 });
  });

  test("POST /trade/local normalizes the body and returns the transaction bytes as base64", async () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251, 252]);
    const { fetchImpl, calls } = mockFetch(() => new Response(bytes, { status: 200, headers: { "content-type": "application/octet-stream" } }));
    const out = (await handleRequest(
      {
        method: "POST",
        path: "/trade/local",
        body: { publicKey: WALLET, action: "buy", mint: MINT, amount: 0.01, denominatedInSol: true, slippage: 10, priorityFee: 0.0005 },
      },
      baseEnv(),
      { fetchImpl },
    )) as { transaction: string; encoding: string; bytes: number };
    expect(out.encoding).toBe("base64");
    expect(out.bytes).toBe(6);
    expect(Array.from(Uint8Array.from(atob(out.transaction), (c) => c.charCodeAt(0)))).toEqual([1, 2, 3, 250, 251, 252]);
    expect(calls[0]!.url).toBe("https://portal.test/api/trade-local");
    const sent = JSON.parse(calls[0]!.init!.body as string);
    expect(sent).toEqual({
      action: "buy",
      mint: MINT,
      amount: 0.01,
      denominatedInSol: "true",
      slippage: 10,
      priorityFee: 0.0005,
      pool: "auto",
      publicKey: WALLET,
    });
  });

  test("POST /trade/local validates required fields and create metadata", async () => {
    const { fetchImpl, calls } = mockFetch(() => jsonRes({}));
    const base = { publicKey: WALLET, mint: MINT, amount: 0.1, denominatedInSol: true, slippage: 10, priorityFee: 0.0005 };
    await expect(handleRequest({ method: "POST", path: "/trade/local", body: { ...base, action: "burn" } }, baseEnv(), { fetchImpl })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(handleRequest({ method: "POST", path: "/trade/local", body: { ...base, action: "create" } }, baseEnv(), { fetchImpl })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const { publicKey: _pk, ...noKey } = base;
    await expect(handleRequest({ method: "POST", path: "/trade/local", body: { ...noKey, action: "buy" } }, baseEnv(), { fetchImpl })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(calls.length).toBe(0);
  });

  test("POST /trade/lightning is NOT_CONFIGURED without a key and attaches the key when set", async () => {
    const { fetchImpl, calls } = mockFetch(() => jsonRes({ signature: "sig" }));
    const body = { action: "sell", mint: MINT, amount: "100%", denominatedInSol: false, slippage: 10, priorityFee: 0.0005, pool: "pump" };
    await expect(handleRequest({ method: "POST", path: "/trade/lightning", body }, baseEnv(), { fetchImpl })).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    const out = await handleRequest({ method: "POST", path: "/trade/lightning", body }, { ...baseEnv(), PUMPPORTAL_API_KEY: "secret-key" }, { fetchImpl });
    expect(out).toEqual({ signature: "sig" });
    const u = new URL(calls[0]!.url);
    expect(u.pathname).toBe("/api/trade");
    expect(u.searchParams.get("api-key")).toBe("secret-key");
    const sent = JSON.parse(calls[0]!.init!.body as string);
    expect(sent.denominatedInSol).toBe("false");
    expect(sent.publicKey).toBeUndefined();
  });

  test("POST /rpc enforces the method allow-list and unwraps JSON-RPC", async () => {
    const env = { ...baseEnv(), RPC_URL: "https://rpc.test/?api-key=k" };
    const { fetchImpl, calls } = mockFetch(() => jsonRes({ jsonrpc: "2.0", id: 1, result: { value: 42 } }));
    await expect(handleRequest({ method: "POST", path: "/rpc", body: { method: "getAccountInfo" } }, baseEnv(), { fetchImpl })).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    await expect(handleRequest({ method: "POST", path: "/rpc", body: { method: "requestAirdrop", params: [] } }, env, { fetchImpl })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(calls.length).toBe(0);
    const out = await handleRequest({ method: "POST", path: "/rpc", body: { method: "getAccountInfo", params: [MINT, { encoding: "base64" }] } }, env, { fetchImpl });
    expect(out).toEqual({ value: 42 });
    expect(calls[0]!.url).toBe("https://rpc.test/?api-key=k");
    expect(JSON.parse(calls[0]!.init!.body as string)).toEqual({ jsonrpc: "2.0", id: 1, method: "getAccountInfo", params: [MINT, { encoding: "base64" }] });
  });

  test("POST /rpc surfaces JSON-RPC errors", async () => {
    const env = { ...baseEnv(), RPC_URL: "https://rpc.test" };
    const { fetchImpl } = mockFetch(() => jsonRes({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "Invalid param" } }));
    await expect(handleRequest({ method: "POST", path: "/rpc", body: { method: "sendTransaction", params: ["xx"] } }, env, { fetchImpl })).rejects.toThrow(/Invalid param/);
  });
});

describe("hybrid mode (official spec merged)", () => {
  const fakeOfficial = {
    openapi: "3.0.0",
    info: { title: "pump.fun Developer API", version: "0.294.0", description: "Read-only social data." },
    servers: [{ url: "https://api.pump.fun/v1" }, { url: "https://api-devnet.pump.fun/v1" }],
    tags: [{ name: "profiles.read" }],
    paths: {
      "/users/{id}": { get: { operationId: "get_users_by_id", tags: ["profiles.read"], responses: {} } },
      "/users/batch": { post: { operationId: "post_users_batch", responses: {} } },
      "/following/v3/followers/count/{userId}": { get: { operationId: "x", responses: {} } },
    },
  };
  const official = prepareOfficialSpec(fakeOfficial);
  const hybridEnv = (over: Partial<Env> = {}): Env => ({ ...baseEnv(), PUMP_OPENAPI_URL: "https://docs.pump.fun/openapi.public.json", PUMP_API_KEY: "pf_live_x", ...over });

  test("official paths go to servers[0] with the bearer key; errors keep the pump.fun envelope", async () => {
    const { fetchImpl, calls } = mockFetch((url) =>
      url.includes("/users/batch")
        ? new Response(JSON.stringify({ statusCode: 429, error: "API_KEY_RATE_LIMITED", retryAfterMs: 500 }), { status: 429, headers: { "retry-after": "1", "content-type": "application/json" } })
        : jsonRes({ id: "u1" }),
    );
    const out = await handleRequest({ method: "GET", path: "/users/u1", query: { expand: true } }, hybridEnv(), { fetchImpl, official });
    expect(out).toEqual({ id: "u1" });
    expect(calls[0]!.url).toBe("https://api.pump.fun/v1/users/u1?expand=true");
    expect((calls[0]!.init!.headers as Record<string, string>).authorization).toBe("Bearer pf_live_x");
    await expect(handleRequest({ method: "POST", path: "/users/batch", body: { ids: ["a"] } }, hybridEnv(), { fetchImpl, official })).rejects.toMatchObject({
      code: "UPSTREAM",
      status: 429,
      message: expect.stringContaining("API_KEY_RATE_LIMITED"),
    });
    expect(calls[1]!.init!.body).toBe('{"ids":["a"]}');
  });

  test("PUMP_API_ORIGIN overrides the origin (devnet)", async () => {
    const { fetchImpl, calls } = mockFetch(() => jsonRes({}));
    await handleRequest({ method: "GET", path: "/following/v3/followers/count/abc" }, hybridEnv({ PUMP_API_ORIGIN: "https://api-devnet.pump.fun/v1/" }), { fetchImpl, official });
    expect(calls[0]!.url).toBe("https://api-devnet.pump.fun/v1/following/v3/followers/count/abc");
  });

  test("official routes without a key fail with NOT_CONFIGURED before any fetch; community routes still work", async () => {
    const { fetchImpl, calls } = mockFetch(() => jsonRes([]));
    await expect(handleRequest({ method: "GET", path: "/users/u1" }, hybridEnv({ PUMP_API_KEY: undefined }), { fetchImpl, official })).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    expect(calls.length).toBe(0);
    await handleRequest({ method: "GET", path: "/coins", query: { limit: 1 } }, hybridEnv({ PUMP_API_KEY: undefined }), { fetchImpl, official });
    expect(new URL(calls[0]!.url).origin).toBe("https://frontend.test");
  });

  test("path templates match only whole segments", () => {
    expect(matchOfficialPath(official.matchers, "/users/abc")).toBe("/users/{id}");
    expect(matchOfficialPath(official.matchers, "/users/abc/extra")).toBeNull();
    expect(matchOfficialPath(official.matchers, "/users")).toBeNull();
    expect(matchOfficialPath(official.matchers, "/coins/abc")).toBeNull();
  });

  test("mergeSpecs keeps official info/servers/components, appends community paths and tags, marks them keyless", () => {
    const merged = mergeSpecs({ ...fakeOfficial, components: { schemas: { A: {} } } }, communitySpec) as Record<string, any>;
    expect(merged.servers[0].url).toBe("https://api.pump.fun/v1");
    expect(merged.components.schemas.A).toEqual({});
    expect(Object.keys(merged.paths)).toEqual(expect.arrayContaining(["/users/{id}", "/curve/{mint}", "/trade/local", "/rpc"]));
    expect(merged.paths["/curve/{mint}"].get.security).toEqual([]);
    expect(merged.paths["/users/{id}"].get.security).toBeUndefined();
    expect(merged.tags.map((t: any) => t.name)).toEqual(expect.arrayContaining(["profiles.read", "chain", "trading"]));
    expect(merged.info.description).toContain("OFFICIAL");
    expect(merged.info.description).toContain("Data from pump.fun");
  });
});
