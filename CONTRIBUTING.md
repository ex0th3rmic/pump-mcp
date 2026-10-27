# Contributing

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues go through
[private reporting](SECURITY.md), not public issues.

Issues and pull requests are welcome. Questions count: open an issue with the Question template and it
will get an answer and, usually, a doc fix.

## Setup

```sh
bun install
cp .dev.vars.example .dev.vars   # MCP_BEARER_TOKEN; RPC_URL for chain reads
bun run build                    # web app → dist/
bun run dev                      # Worker on :8790, web app at / and /app
bun run dev:web                  # optional: Vite with hot reload on :5173
```

`bun test` runs Worker and pure web-library tests (bun:test; upstream fetches are injected, nothing
hits the network). `bun run typecheck` runs `tsc` for the Worker, tests, and browser suite, then
`svelte-check` for the app.

```sh
bunx playwright install chromium
bun run test:e2e                 # Vite + Chromium, mocked MCP and Wallet Standard wallet
bun run test:integration:devnet  # opt-in real devnet launch/buys; never targets mainnet
```

## Where things live

- `src/` is the Worker. `index.ts` routes requests and serves `/app` through the same static Svelte
  shell; `upstreams.ts` is the only place that talks to Solana, IPFS or pump.fun and the only place
  secrets are read; `tx.ts` builds trades with pump.fun's SDK; `curve.ts` decodes bonding curves;
  `spec.ts` and `official.ts` build the OpenAPI document the agent sees.
- `web/` is the landing page and console: Svelte 5, no component library. `lib/examples.ts` holds the
  example questions and code; `lib/mcp.ts` owns MCP sessions; `lib/transactions.ts` implements the
  preview/simulate/sign/submit lifecycle; `components/console/` holds the operator views.
- `test/` mirrors `src/`; `test/web/` covers browser-independent web libraries.
- `e2e/` contains Playwright tests with mocked same-origin APIs and a mock Wallet Standard wallet.

## Ground rules

- Worker changes come with a test that failed before the change. The suite is fast; run it often.
- Model-written code must never reach the network or the secrets. Anything that widens what the sandbox
  can call goes through the route table in `upstreams.ts` and gets a test for the refusal case too.
- New routes go into the OpenAPI document with a one-line summary; that text is what the agent reads.
- Example questions on the page must run as written against a live server. If an example needs the
  pump.fun key, mark it `needsKey`.
- Keep the page honest: no claims the Worker does not back, and numbers carry their source.
- Never request seed phrases or private keys. Wallet changes and every form change must invalidate the
  transaction preview. Signing requires a successful simulation and explicit cluster confirmation.
  Do not add automatic rebroadcasting or custodial signing.
- Bearer tokens stay in `sessionStorage`; activity stays in memory and excludes tokens, code,
  transaction payloads, artwork, and full API responses.
- No bearer tokens, RPC URLs with keys, wallet secrets, or personal data in commits, issues, or
  screenshots.

## Adding a client snippet

Add an entry to `web/src/lib/snippets.ts` with the exact command or config the client documents for a
streamable-HTTP MCP server with a bearer header, and link the doc you took it from in the PR.
