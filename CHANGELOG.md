# Changelog

Notable changes to pump-mcp. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and the project uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Changed
- Trades are built in the Worker with pump.fun's official SDK (`@pump-fun/pump-sdk`) instead of PumpPortal:
  v3 bonding-curve instructions, PumpSwap after graduation, no third-party fee. Responses now include a
  quote, the venue, required signers and any lookup tables used. `POST /trade` is the route;
  `/trade/local` remains as a deprecated alias.

### Removed
- `POST /trade/lightning` and the `PUMPPORTAL_*` settings. The server no longer offers a custodial route.

### Added
- Coin launches: `POST /metadata` pins a new coin's image and metadata to IPFS (`PINATA_JWT`), and
  `/trade` create generates the mint server-side, pre-signs with it and discards it.
- `LOOKUP_TABLES` and `bun run lookup-table`, which creates the operator's lookup table so create with a
  dev buy fits in one transaction.
- Offline transaction tests that replay recorded mainnet RPC responses (`test/support/rpc-cassette.ts`).
- README branding (theme-aware logo, both colorways, banner, X header, social preview), badges, quickstart,
  configuration reference, roadmap, FAQ and acknowledgements.
- `SECURITY.md` with private vulnerability reporting, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1),
  this changelog, and a CI workflow running tests, typecheck and build on every push and pull request.

## [0.1.0] - 2026-10-25

### Added
- Code Mode MCP server on Cloudflare Workers: two tools, `search` and `execute`, over one merged OpenAPI
  document. Model code runs in a Dynamic Worker sandbox with no network; secrets stay in the host Worker.
- Official pump.fun Developer API routes (67 operations), enabled by `PUMP_API_KEY`.
- `GET /curve/{mint}`: bonding curves decoded straight from Solana, with price, market cap, graduation
  progress and buy/sell quotes for SOL-, USDC- and PUMP-quoted coins.
- `POST /rpc` with an allow-listed set of Solana JSON-RPC methods.
- `POST /trade/local`: unsigned buy, sell and create transactions via PumpPortal.
- Web app (Svelte 5 + Vite): live showcase curve, connect snippets for eight MCP clients, example
  questions that load into a token-gated playground, a "why Code Mode" section with animated diagrams.
- `GET /llms.txt` for agents and `GET /api/showcase` (public, cached 20 s).
- Optional usage counts in Workers Analytics Engine: page views and tool calls by name, nothing else.
- Issue templates, pull request template and `CONTRIBUTING.md`.
- Logo mark in two colorways, README banner and X header.

[Unreleased]: https://github.com/ex0th3rmic/pump-mcp/compare/c73cc34...main
[0.1.0]: https://github.com/ex0th3rmic/pump-mcp/commits/main
