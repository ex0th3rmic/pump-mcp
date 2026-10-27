import { describe, expect, test } from "bun:test";
import { McpClient, normalizeToken, tokenHint } from "../../web/src/lib/mcp";

function response(body: unknown, init: { session?: string; status?: number; sse?: boolean } = {}): Response {
  const text = init.sse ? `event: message\ndata: ${JSON.stringify(body)}\n\n` : JSON.stringify(body);
  return new Response(text, {
    status: init.status ?? 200,
    headers: { "content-type": init.sse ? "text/event-stream" : "application/json", ...(init.session ? { "mcp-session-id": init.session } : {}) },
  });
}

function clientWithTool(payload: unknown, calls: Array<{ method: string; authorization?: string }>) {
  return new McpClient(async (_input, init) => {
    const body = JSON.parse(init!.body as string) as { id?: number; method: string };
    calls.push({ method: body.method, authorization: (init!.headers as Record<string, string>).authorization });
    if (body.method === "initialize") return response({ jsonrpc: "2.0", id: body.id, result: {} }, { session: `session-${calls.length}` });
    if (body.method === "notifications/initialized") return response({});
    return response({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: JSON.stringify(payload) }] } });
  });
}

describe("browser MCP client", () => {
  test("normalizes pasted tokens and identifies common secret mixups", () => {
    expect(normalizeToken(" Bearer <abc123> ")).toBe("abc123");
    expect(tokenHint("pf_live_abcdefghijklmnopqrstuvwxyz")).toContain("pump.fun API key");
    expect(tokenHint("short")).toContain("too short");
    expect(tokenHint("a-long-enough-token")).toBeNull();
  });

  test("initializes once, parses structured results, and resets the session when the token changes", async () => {
    const calls: Array<{ method: string; authorization?: string }> = [];
    const client = clientWithTool({ ok: true }, calls);
    const first = await client.execute<{ ok: boolean }>("first-token", "async () => ({})");
    expect(first.data).toEqual({ ok: true });
    expect(first.text).toContain("\n");
    await client.execute("first-token", "async () => ({})");
    expect(calls.filter((call) => call.method === "initialize")).toHaveLength(1);
    await client.execute("second-token", "async () => ({})");
    expect(calls.filter((call) => call.method === "initialize")).toHaveLength(2);
    expect(calls.at(-1)?.authorization).toBe("Bearer second-token");
  });

  test("parses SSE tool responses", async () => {
    const calls: Array<{ method: string; authorization?: string }> = [];
    const client = new McpClient(async (_input, init) => {
      const body = JSON.parse(init!.body as string) as { id?: number; method: string };
      calls.push({ method: body.method });
      if (body.method === "initialize") return response({ jsonrpc: "2.0", id: body.id, result: {} }, { session: "s", sse: true });
      if (body.method === "notifications/initialized") return response({}, { sse: true });
      return response({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "{\"answer\":42}" }] } }, { sse: true });
    });
    const result = await client.execute<{ answer: number }>("a-long-enough-token", "code");
    expect(result.data?.answer).toBe(42);
  });

  test("rejects malformed JSON and unauthorized sessions with useful errors", async () => {
    const malformed = new McpClient(async (_input, init) => {
      const body = JSON.parse(init!.body as string) as { method: string };
      if (body.method === "initialize") return response({ jsonrpc: "2.0", id: 1, result: {} });
      if (body.method === "notifications/initialized") return response({});
      return new Response("not-json");
    });
    await expect(malformed.execute("a-long-enough-token", "code")).rejects.toThrow("malformed JSON");
    const unauthorized = new McpClient(async () => response({ error: "UNAUTHORIZED" }, { status: 401 }));
    await expect(unauthorized.execute("wrong-token", "code")).rejects.toThrow("rejected that token");
  });
});
