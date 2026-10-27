export interface RunResult<T = unknown> {
  text: string;
  data: T | null;
  isError: boolean;
  ms: number;
}

interface JsonRpcMessage {
  id?: number;
  result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
  error?: unknown;
}

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export function normalizeToken(raw: string): string {
  return raw.trim().replace(/^bearer\s+/i, "").replace(/^["'<]+|[>"']+$/g, "").trim();
}

export function tokenHint(token: string): string | null {
  if (/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return "That looks like a JWT (for example a Pinata key), not this server's bearer token.";
  if (/^pf_(live|test)_/.test(token)) return "That looks like a pump.fun API key, not this server's bearer token.";
  if (token.length < 16) return "That is too short to be the bearer token.";
  return null;
}

export class McpClient {
  private token = "";
  private sessionId: string | null = null;
  private initializing: Promise<void> | null = null;

  constructor(private readonly fetchImpl: FetchImpl = (input, init) => fetch(input, init)) {}

  reset(): void {
    this.token = "";
    this.sessionId = null;
    this.initializing = null;
  }

  async initialize(token: string): Promise<void> {
    this.prepare(token);
    await this.ensureSession();
  }

  private prepare(token: string): void {
    const normalized = normalizeToken(token);
    if (normalized !== this.token) {
      this.sessionId = null;
      this.initializing = null;
      this.token = normalized;
    }
  }

  private async rpc(method: string, params: unknown, id?: number): Promise<JsonRpcMessage["result"] | null> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${this.token}`,
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;
    const body = id === undefined ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id, method, params };
    const res = await this.fetchImpl("/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    this.sessionId = res.headers.get("mcp-session-id") || this.sessionId;
    const text = await res.text();
    if (res.status === 401) throw new Error("The server rejected that token (401). Ask the operator for this server's MCP bearer token.");
    if (res.status === 503) throw new Error("The server has no MCP_BEARER_TOKEN set yet, so /mcp is off.");
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    if (id === undefined) return null;
    try {
      const lines = text.split("\n").filter((line) => line.startsWith("data:"));
      const messages: JsonRpcMessage[] = lines.length
        ? lines.map((line) => JSON.parse(line.slice(5).trim()) as JsonRpcMessage)
        : [JSON.parse(text) as JsonRpcMessage];
      const message = messages.find((item) => item.id === id) ?? messages[0];
      if (!message) throw new Error("Empty response from /mcp");
      if (message.error) throw new Error(JSON.stringify(message.error));
      return message.result ?? null;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Empty response")) throw error;
      if (error instanceof SyntaxError) throw new Error("The MCP server returned malformed JSON.");
      throw error;
    }
  }

  private async ensureSession(): Promise<void> {
    if (this.sessionId) return;
    if (this.initializing) return this.initializing;
    this.initializing = (async () => {
      await this.rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "pump-mcp-web", version: "0.2" },
      }, 1);
      await this.rpc("notifications/initialized", {});
    })();
    try {
      await this.initializing;
    } catch (error) {
      this.sessionId = null;
      throw error;
    } finally {
      this.initializing = null;
    }
  }

  async execute<T = unknown>(token: string, code: string): Promise<RunResult<T>> {
    const started = performance.now();
    this.prepare(token);
    try {
      await this.ensureSession();
      const result = await this.rpc("tools/call", {
        name: "execute",
        arguments: { code },
      }, Date.now());
      const raw = (result?.content ?? []).map((item) => item.text ?? JSON.stringify(item)).join("\n");
      let data: T | null = null;
      let text = raw;
      try {
        data = JSON.parse(raw) as T;
        text = JSON.stringify(data, null, 2);
      } catch {
        // Plain-text tool responses remain displayable without structured data.
      }
      return { text, data, isError: Boolean(result?.isError), ms: Math.round(performance.now() - started) };
    } catch (error) {
      this.sessionId = null;
      throw error;
    }
  }
}

export const mcp = new McpClient();
