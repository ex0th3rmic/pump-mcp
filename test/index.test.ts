import { describe, expect, test } from "bun:test";
import worker, { createHandler } from "../src/index";
import type { Env } from "../src/env";
import type { FetchLike } from "../src/upstreams";

// Mainnet fixture captured 2026-10-24 (see curve.test.ts): graduated curve of 9BB6...pump.
const GRADUATED_MINT = "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump";
const GRADUATED_CURVE = "TBHe5tJnuT4CQbHorJ1uVdfUoaYGPKgfCpiv2jgesVN";
const GRADUATED_DATA =
  "F7f4N2DYrGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAxqR+jQMAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const env = (over: Partial<Env> = {}): Env => ({ LOADER: {} as WorkerLoader, MCP_BEARER_TOKEN: "s3cret", ...over });
const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;

describe("worker routes", () => {
  test("/health reports mode and configured features without leaking values", async () => {
    const res = await worker.fetch(new Request("https://x/health"), env({ RPC_URL: "https://rpc.test/?api-key=k" }), ctx);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.mode).toBe("community");
    expect(body.officialKey).toBe(false);
    const hybrid = (await (await worker.fetch(new Request("https://x/health"), env({ PUMP_OPENAPI_URL: "https://docs.pump.fun/openapi.public.json" }), ctx)).json()) as Record<string, unknown>;
    expect(hybrid.mode).toBe("hybrid");
    expect(body.rpc).toBe(true);
    expect(body.lightning).toBe(false);
    expect(JSON.stringify(body)).not.toContain("api-key");
  });

  test("/openapi.json serves the bundled spec in community mode", async () => {
    const res = await worker.fetch(new Request("https://x/openapi.json"), env(), ctx);
    const spec = (await res.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(spec.openapi).toBe("3.1.0");
    expect(Object.keys(spec.paths)).toContain("/trade/local");
    expect(Object.keys(spec.paths)).toContain("/rpc");
  });

  test("/mcp requires the bearer token", async () => {
    expect((await worker.fetch(new Request("https://x/mcp", { method: "POST" }), env(), ctx)).status).toBe(401);
    expect((await worker.fetch(new Request("https://x/mcp", { method: "POST", headers: { authorization: "Bearer wrong" } }), env(), ctx)).status).toBe(401);
    expect((await worker.fetch(new Request("https://x/mcp", { method: "POST" }), env({ MCP_BEARER_TOKEN: undefined }), ctx)).status).toBe(503);
  });

  test("unknown paths are 404 without assets and go to the ASSETS binding with it", async () => {
    expect((await worker.fetch(new Request("https://x/nope"), env(), ctx)).status).toBe(404);
    const assets = { fetch: async (req: Request) => new Response(`asset:${new URL(req.url).pathname}`) } as unknown as Fetcher;
    expect(await (await worker.fetch(new Request("https://x/"), env({ ASSETS: assets }), ctx)).text()).toBe("asset:/");
    expect((await worker.fetch(new Request("https://x/", { method: "POST" }), env({ ASSETS: assets }), ctx)).status).toBe(404);
  });

  test("/llms.txt describes the server for agents in plain text, with the MCP URL of the request origin", async () => {
    const res = await worker.fetch(new Request("https://x/llms.txt"), env(), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toContain("https://x/mcp");
    expect(text).toContain("execute");
    expect(text).toContain("search");
    expect(text).toContain("Authorization: Bearer");
    expect(text).not.toContain("s3cret");
  });

  test("/api/showcase is 404 unless SHOWCASE_MINT and RPC_URL are both set", async () => {
    expect((await worker.fetch(new Request("https://x/api/showcase"), env({ RPC_URL: "https://rpc.test" }), ctx)).status).toBe(404);
    expect((await worker.fetch(new Request("https://x/api/showcase"), env({ SHOWCASE_MINT: GRADUATED_MINT }), ctx)).status).toBe(404);
  });

  test("/api/showcase returns the showcase coin's curve without a bearer token, cacheable for 20s", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push(url);
      const body = JSON.parse(init!.body as string) as { method: string; params: [string] };
      expect(body.method).toBe("getAccountInfo");
      expect(body.params[0]).toBe(GRADUATED_CURVE);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { value: { data: [GRADUATED_DATA, "base64"], owner: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P" } } }), { headers: { "content-type": "application/json" } });
    };
    const handler = createHandler({ fetchImpl });
    const res = await handler.fetch(new Request("https://x/api/showcase"), env({ RPC_URL: "https://rpc.test/?api-key=k", SHOWCASE_MINT: GRADUATED_MINT }), ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=20");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.mint).toBe(GRADUATED_MINT);
    expect(body.complete).toBe(true);
    expect(body.graduationProgress).toBe(1);
    expect(calls).toEqual(["https://rpc.test/?api-key=k"]);
    expect(JSON.stringify(body)).not.toContain("api-key");
  });

  test("usage: a page view and a tools/call are counted in Analytics Engine without the token or body", async () => {
    const points: Array<{ blobs?: string[]; doubles?: number[]; indexes?: string[] }> = [];
    const analytics = { writeDataPoint: (p: { blobs?: string[]; doubles?: number[]; indexes?: string[] }) => points.push(p) } as unknown as AnalyticsEngineDataset;
    const assets = { fetch: async () => new Response("page") } as unknown as Fetcher;
    const e = env({ ASSETS: assets, ANALYTICS: analytics });

    await worker.fetch(new Request("https://x/"), e, ctx);
    await worker.fetch(new Request("https://x/assets/app.js"), e, ctx);
    await worker.fetch(new Request("https://x/mcp", { method: "POST", headers: { authorization: "Bearer s3cret", "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "execute", arguments: { code: "secret code" } } }) }), e, ctx).catch(() => {});
    await worker.fetch(new Request("https://x/mcp", { method: "POST", headers: { authorization: "Bearer wrong" } }), e, ctx);

    expect(points.map((p) => p.blobs)).toEqual([
      ["page", "/"],
      ["mcp", "execute"],
      ["mcp", "unauthorized"],
    ]);
    expect(JSON.stringify(points)).not.toContain("s3cret");
    expect(JSON.stringify(points)).not.toContain("secret code");
  });

  test("usage: no ANALYTICS binding means nothing is written and nothing breaks", async () => {
    const assets = { fetch: async () => new Response("page") } as unknown as Fetcher;
    expect((await worker.fetch(new Request("https://x/"), env({ ASSETS: assets }), ctx)).status).toBe(200);
  });
});
