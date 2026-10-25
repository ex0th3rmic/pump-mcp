# pump-codemode-mcp

Self-hosted **Code Mode** MCP server for [pump.fun](https://docs.pump.fun), running on Cloudflare
Workers. Instead of one MCP tool per endpoint, agents get two tools, `search` and `execute`, and write
JavaScript against an OpenAPI document. The code runs in a sandboxed Dynamic Worker with no network
access; every API call comes back to the host Worker, which attaches credentials and forwards it to an
allow-listed upstream. Built with [`@cloudflare/codemode`](https://developers.cloudflare.com/agents/tools/codemode/)
and `agents/mcp`. MIT licensed. Data from pump.fun.

It ships with a web app at `/` (Svelte 5 + Vite, source in `web/`): a live bonding curve for a showcase
coin, connect snippets for Claude Code, Codex, Cursor, Kimi, Gemini CLI, OpenCode and Claude Desktop,
example questions with the code they run, and a token-gated playground that runs the real `execute`
tool. `/llms.txt` says the same for agents.

## What it exposes

One merged OpenAPI document, routed per path:

| Routes | Upstream | Needs | Notes |
|---|---|---|---|
| **Official Developer API** (67 ops): `/users/*`, `/following/*`, `/callout/*`, `/posts/*`, `/pnl-leaderboard/*`, `/competitions/*`, `/user-positions/*`, `/user-trades/*`, `/portfolio-summary*`, `/moderation/*`, ... | `https://api.pump.fun/v1` (devnet: `api-devnet.pump.fun`) | `PUMP_API_KEY` (`pf_live_...`) | Read-only social data. Spec fetched from `https://docs.pump.fun/openapi.public.json` and cached 1h. Scopes, 2 rps / 50k per day per key. Error envelopes (`API_KEY_RATE_LIMITED`, `retryAfterMs`...) are passed through. |
| `GET /curve/{mint}` | Solana RPC, bonding-curve PDA decoded in-Worker (`src/curve.ts`, layout from the public IDL) | `RPC_URL` | Reserves, price, market cap, graduation progress, buy/sell quotes. Handles SOL-, USDC- and PUMP-quoted curves; Mayhem-mode coins get price but no quotes. |
| `POST /rpc` | Solana RPC, allow-listed methods only | `RPC_URL` | `getAccountInfo`, `getBalance`, `getTransaction`, `simulateTransaction`, `sendTransaction`, ... (`RPC_ALLOWED_METHODS`). |
| `POST /trade/local` | PumpPortal Local API | nothing | Returns an **unsigned** base64 transaction for the given wallet. PumpPortal takes 0.5%. |
| `POST /trade/lightning` | PumpPortal Lightning API | `PUMPPORTAL_API_KEY` | Disabled unless set. Moves funds from the PumpPortal-custodied wallet. |
| `GET /coins*`, `/trades/*`, `/candlesticks/*`, `/replies/*`, `/balances/*`, `/sol-price` | `frontend-api-v3.pump.fun` (unofficial, the website's API) | nothing | **Blocked from servers today**: pump.fun fronts it with a bot challenge, so Workers get `403 Just a moment...`. Kept for when that changes or for a mirror set via `PUMP_FRONTEND_API_ORIGIN`. |

Secrets never reach the sandbox: they are attached in `src/upstreams.ts` only. Unknown paths are refused
before any fetch, so model code cannot use the Worker as an open proxy, and `fetch()` inside the sandbox throws.

### Why not the stock pump.fun MCP server?

pump.fun runs one at `https://mcp.pump.fun/mcp` (28 tools, each exactly one API call, stateless, your
`pf_live_` key as bearer). Use it if you only need the social API. This server is for when you want:
the whole 67-route surface instead of 28 tools; filtering and joins in code so a multi-step question
costs one tool call and a few hundred output tokens instead of N round trips; and the on-chain,
RPC and trading routes next to it, under one token your agents already hold.

## Get a pump.fun key

Sign in at [developers.pump.fun](https://developers.pump.fun) with your pump.fun account, apply
(business name, email, use case, scopes), verify the email, wait for approval, then create a key.
It is shown once. Until approved, everything except the official routes works.

## Run locally

```sh
cp .dev.vars.example .dev.vars        # MCP_BEARER_TOKEN; RPC_URL for chain reads; PUMP_API_KEY when you have one
bun install
bun run build                         # builds the web app into ./dist (wrangler serves it)
bun run dev                           # http://localhost:8790  (web app at /, MCP at /mcp)
bun run dev:web                       # optional: Vite with hot reload at :5173, proxying the Worker routes to :8790
bun test && bun run typecheck         # Worker tests + tsc, then svelte-check
```

Connect Claude Code:

```sh
claude mcp add --transport http pump http://localhost:8790/mcp --header "Authorization: Bearer <MCP_BEARER_TOKEN>"
```

Claude Desktop / Cursor: `{"mcpServers":{"pump":{"url":"http://localhost:8790/mcp","headers":{"Authorization":"Bearer <MCP_BEARER_TOKEN>"}}}}`.

Example `execute` body the model writes:

```js
async () => {
  const mint = "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump";
  const curve = await codemode.request({ method: "GET", path: `/curve/${mint}`, query: { buyAmount: 0.5 } });
  const holders = await codemode.request({ method: "GET", path: `/mint-positions/${mint}` }); // official, needs key
  const tx = await codemode.request({
    method: "POST", path: "/trade/local",
    body: { publicKey: WALLET, action: "buy", mint, amount: 0.5, denominatedInSol: true, slippage: 10, priorityFee: 0.0005, pool: "auto" },
  });
  return { quoteAsset: curve.quote.symbol, price: curve.priceInQuote, topHolders: holders.slice(0, 5), unsignedTx: tx.transaction };
}
```

## Deploy

```sh
npx wrangler login                        # or CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID
wrangler secret put MCP_BEARER_TOKEN      # required; /mcp answers 503 without it
wrangler secret put PUMP_API_KEY          # pf_live_... (optional until approved)
wrangler secret put RPC_URL               # keyed Helius URL; enables /curve and /rpc
wrangler secret put PUMPPORTAL_API_KEY    # optional; enables /trade/lightning
bun run deploy                            # vite build, then wrangler deploy
```

`wrangler.toml` deploys to a Workers Custom Domain (`routes = [{ pattern = "...", custom_domain = true }]`);
change the pattern to your own hostname or set `workers_dev = true` for a `*.workers.dev` URL. Set
`SHOWCASE_MINT` (a plain var) to any live pump.fun mint and the web app draws its real curve on load
through `GET /api/showcase`, a public read of that one mint cached for 20 seconds. Leave it empty for a
static illustration.

Worker Loader bindings (`[[worker_loaders]]`) need the Workers Paid plan in production; `wrangler dev`
runs them locally for free. Devnet: set `PUMP_API_ORIGIN = "https://api-devnet.pump.fun/v1"`. To serve
only the non-official routes set `PUMP_OPENAPI_URL = ""`. The bundle is ~5 MB raw / ~1 MB gzip (`agents/mcp`).

## Terms you are bound by

Your `pf_live_` key makes you the licensee under the
[pump.fun Developer API Terms](https://docs.pump.fun/terms/) (updated 2026-10-22). The ones that shape
how to run this server:

- Keys are per organisation and may not be shared, sublicensed or made available to third parties (6.4).
- You may not offer a service that gives third parties programmatic access to API data (8.3b). Run this
  for your own organisation's agents and applications, behind your own `MCP_BEARER_TOKEN`; do not
  publish the endpoint.
- Agents may retrieve data through MCP to answer a request but not retain it for AI training (8.3e).
  This server stores nothing; the only cache is the public OpenAPI document.
- Cache API data for at most 24 hours (8.7); show "Data from pump.fun" to end users (10.3).
- Honour rate-limit and `Retry-After` headers; no spreading load across keys (7.2).

The on-chain, RPC and PumpPortal routes are outside those terms. PumpPortal has its own.

## Layout

- `src/index.ts` - Worker entry: `/health`, `/openapi.json`, `/llms.txt`, `/api/showcase`, bearer-gated `/mcp`, static assets for the rest. Builds `openApiMcpServer` with a `DynamicWorkerExecutor` on `env.LOADER`.
- `src/official.ts` - fetches/merges the official OpenAPI document and matches its path templates.
- `src/spec.ts` - the non-official routes as OpenAPI 3.1.
- `src/upstreams.ts` - host-side `request()` router: route table, validation, secret injection, binary-to-base64 for transactions.
- `src/curve.ts` - bonding-curve PDA derivation (noble ed25519 + sha256) and Borsh decode per the IDL, quotes.
- `web/` - the web app (Svelte 5). `vite build` writes it to `dist/`, which `[assets]` in `wrangler.toml` serves.
- `test/` - `bun test`; upstreams are exercised with an injected `fetch`.

## Caveats

- Code Mode is marked experimental by Cloudflare; `@cloudflare/codemode` and `agents` are pinned.
- Final MCP responses are truncated around 6k tokens; the tool description tells the model to filter in code.
- The frontend-API routes are best effort and unofficial.
