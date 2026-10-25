import { describe, expect, test } from "bun:test";
import worker from "../src/index";
import type { Env } from "../src/env";

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
});
