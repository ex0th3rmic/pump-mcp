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
bun run dev                      # Worker on :8790, web app at /
bun run dev:web                  # optional: Vite with hot reload on :5173
```

`bun test` runs the Worker tests (bun:test; upstream fetches are injected, nothing hits the network).
`bun run typecheck` runs `tsc` for the Worker and `svelte-check` for the page.

## Where things live

- `src/` is the Worker. `index.ts` routes requests; `upstreams.ts` is the only place that talks to
  Solana, IPFS or pump.fun and the only place secrets are read; `tx.ts` builds trades with pump.fun's SDK; `curve.ts` decodes bonding curves;
  `spec.ts` and `official.ts` build the OpenAPI document the agent sees.
- `web/` is the page: Svelte 5, no component library. `lib/examples.ts` holds the example questions and
  the code each one runs; `lib/snippets.ts` holds the per-client connect snippets.
- `test/` mirrors `src/`.

## Ground rules

- Worker changes come with a test that failed before the change. The suite is fast; run it often.
- Model-written code must never reach the network or the secrets. Anything that widens what the sandbox
  can call goes through the route table in `upstreams.ts` and gets a test for the refusal case too.
- New routes go into the OpenAPI document with a one-line summary; that text is what the agent reads.
- Example questions on the page must run as written against a live server. If an example needs the
  pump.fun key, mark it `needsKey`.
- Keep the page honest: no claims the Worker does not back, and numbers carry their source.
- No bearer tokens, RPC URLs with keys, wallet secrets, or personal data in commits, issues, or
  screenshots.

## Adding a client snippet

Add an entry to `web/src/lib/snippets.ts` with the exact command or config the client documents for a
streamable-HTTP MCP server with a bearer header, and link the doc you took it from in the PR.
