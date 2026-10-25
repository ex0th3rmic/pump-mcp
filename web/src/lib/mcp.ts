/**
 * Minimal MCP streamable-HTTP client for the playground: initialize once, then tools/call.
 * Talks to this origin's /mcp with the operator's bearer token.
 */

export interface RunResult {
  text: string;
  isError: boolean;
  ms: number;
}

interface JsonRpcMessage {
  id?: number;
  result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
  error?: unknown;
}

let sessionId: string | null = null;

async function rpc(token: string, method: string, params: unknown, id?: number): Promise<JsonRpcMessage["result"] | null> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${token}`,
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const body = id === undefined ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params };
  const res = await fetch("/mcp", { method: "POST", headers, body: JSON.stringify(body) });
  sessionId = res.headers.get("mcp-session-id") || sessionId;
  const text = await res.text();
  if (res.status === 401) throw new Error("The server rejected that token (401). Check it and try again.");
  if (res.status === 503) throw new Error("The server has no MCP_BEARER_TOKEN set yet, so /mcp is off.");
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  if (id === undefined) return null;
  const lines = text.split("\n").filter((l) => l.startsWith("data:"));
  const msgs: JsonRpcMessage[] = lines.length ? lines.map((l) => JSON.parse(l.slice(5).trim())) : [JSON.parse(text)];
  const msg = msgs.find((m) => m.id === id) ?? msgs[0];
  if (!msg) throw new Error("Empty response from /mcp");
  if (msg.error) throw new Error(JSON.stringify(msg.error));
  return msg.result ?? null;
}

async function ensureSession(token: string): Promise<void> {
  if (sessionId) return;
  await rpc(token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "pump-mcp-web", version: "0.1" } }, 1);
  await rpc(token, "notifications/initialized", {});
}

/** Runs an `execute` tool call with the given function body and returns the pretty-printed result. */
export async function runExecute(token: string, code: string): Promise<RunResult> {
  const t0 = performance.now();
  try {
    await ensureSession(token);
    const r = await rpc(token, "tools/call", { name: "execute", arguments: { code } }, Date.now());
    const raw = (r?.content ?? []).map((c) => c.text ?? JSON.stringify(c)).join("\n");
    let text = raw;
    try {
      text = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      /* not JSON: show as is */
    }
    return { text, isError: Boolean(r?.isError), ms: Math.round(performance.now() - t0) };
  } catch (e) {
    sessionId = null;
    throw e;
  }
}
