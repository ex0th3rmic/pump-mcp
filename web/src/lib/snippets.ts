export interface Snippet {
  id: string;
  label: string;
  /** What the block is: shown as a small caption above the code. */
  caption: string;
  code: (mcpUrl: string) => string;
}

const T = "<token>";

export const snippets: Snippet[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    caption: "terminal",
    code: (u) => `claude mcp add --transport http pump ${u} \\\n  --header "Authorization: Bearer ${T}"`,
  },
  {
    id: "codex",
    label: "Codex",
    caption: "terminal · the token comes from an environment variable",
    code: (u) => `export PUMP_MCP_TOKEN=${T}\ncodex mcp add pump --url ${u} --bearer-token-env-var PUMP_MCP_TOKEN`,
  },
  {
    id: "cursor",
    label: "Cursor",
    caption: ".cursor/mcp.json",
    code: (u) => JSON.stringify({ mcpServers: { pump: { url: u, headers: { Authorization: `Bearer ${T}` } } } }, null, 2),
  },
  {
    id: "kimi",
    label: "Kimi",
    caption: "terminal",
    code: (u) => `kimi mcp add --transport http pump ${u} \\\n  --header "Authorization: Bearer ${T}"`,
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    caption: "terminal",
    code: (u) => `gemini mcp add --transport http pump ${u} \\\n  --header "Authorization: Bearer ${T}"`,
  },
  {
    id: "opencode",
    label: "OpenCode",
    caption: "opencode.json",
    code: (u) => JSON.stringify({ $schema: "https://opencode.ai/config.json", mcp: { pump: { type: "remote", url: u, headers: { Authorization: `Bearer ${T}` } } } }, null, 2),
  },
  {
    id: "claude-desktop",
    label: "Claude Desktop",
    caption: "claude_desktop_config.json · via mcp-remote, since Desktop cannot send a bearer header itself",
    code: (u) =>
      JSON.stringify(
        { mcpServers: { pump: { command: "npx", args: ["-y", "mcp-remote", u, "--header", "Authorization:${PUMP_AUTH}"], env: { PUMP_AUTH: `Bearer ${T}` } } } },
        null,
        2,
      ),
  },
  {
    id: "any",
    label: "Any MCP client",
    caption: "streamable HTTP · JSON-RPC over POST",
    code: (u) =>
      `curl -X POST ${u} \\\n  -H "Authorization: Bearer ${T}" \\\n  -H "Content-Type: application/json" \\\n  -H "Accept: application/json, text/event-stream" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"me","version":"0"}}}'`,
  },
];
