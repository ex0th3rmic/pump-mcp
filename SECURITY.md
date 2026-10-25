# Security policy

pump-mcp runs model-written code and holds API keys, so the security boundary is the point of the
project. Reports are taken seriously and handled privately.

## Reporting a vulnerability

Use GitHub's private reporting: **[Report a vulnerability](https://github.com/ex0th3rmic/pump-mcp/security/advisories/new)**
(Security tab → Advisories → Report a vulnerability). Please do not open a public issue for anything
on the list below.

Include what you did, what you expected, what happened, and the smallest reproduction you can. If a
report needs a running server, test against your own deployment, not someone else's.

Expect an acknowledgement within a few days. Fixes ship to `main` and to the reference deployment,
and the advisory is published with credit unless you ask otherwise.

## In scope

- Sandbox escape: code passed to `execute` reaching the network, the host's environment, or anything
  outside `codemode.request()`.
- Secret exposure: `MCP_BEARER_TOKEN`, `RPC_URL`, `PUMP_API_KEY` or any other secret appearing in a
  response, a log line, an error message, or the sandbox.
- Route-table bypass: a path, method or RPC call that should be refused reaching an upstream, or the
  Worker being usable as an open proxy.
- Auth bypass on `/mcp`, or anything that makes the unauthenticated routes (`/health`, `/openapi.json`,
  `/llms.txt`, `/api/showcase`) do more than they document.
- Transaction building that produces something other than what the request described, or any path by
  which a server-generated mint keypair could leave the Worker.

## Out of scope

- The upstream services themselves (pump.fun and its SDK, Solana RPC providers, Pinata, Cloudflare). Report
  those to their owners.
- Rate limits and quota exhaustion on a deployment you run yourself.
- Findings that need a leaked bearer token; rotate it with `wrangler secret put MCP_BEARER_TOKEN`.

## Supported versions

Only `main` is supported. There are no release branches.
