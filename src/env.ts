export interface Env {
  /** Worker Loader binding: spawns the sandbox that runs model-written code. */
  LOADER: WorkerLoader;
  /** Static web app built to ./dist (optional: the API works without it). */
  ASSETS?: Fetcher;
  /** Optional usage counts: page views and MCP tool calls by name. Nothing else is recorded. */
  ANALYTICS?: AnalyticsEngineDataset;
  /** Required. Clients send `Authorization: Bearer <MCP_BEARER_TOKEN>` to /mcp. */
  MCP_BEARER_TOKEN?: string;

  // Community mode (developers.pump.fun not yet available)
  PUMP_FRONTEND_API_ORIGIN?: string;
  /** Solana RPC. Needed for /curve, /rpc and /trade (transactions are built from live chain state). */
  RPC_URL?: string;
  /** Comma-separated address lookup tables /trade may compile with (create + dev buy needs one). */
  LOOKUP_TABLES?: string;
  /** Pinata JWT. Enables POST /metadata (pins a coin's image and metadata JSON to IPFS). */
  PINATA_JWT?: string;
  /** Gateway prefix for the returned IPFS links. Defaults to https://ipfs.io/ipfs/. */
  IPFS_GATEWAY?: string;
  RPC_ALLOWED_METHODS?: string;
  /** Cluster label used by the web console and explorer links. Must match RPC_URL. */
  SOLANA_CLUSTER?: "mainnet-beta" | "devnet";
  /** Mint whose bonding curve the web app shows on load via GET /api/showcase (public, cached 20s). */
  SHOWCASE_MINT?: string;

  // Official pump.fun Developer API (docs.pump.fun). PUMP_OPENAPI_URL="" disables the official
  // routes entirely and serves the community spec alone.
  PUMP_OPENAPI_URL?: string;
  /** Overrides the spec's servers[0].url, e.g. https://api-devnet.pump.fun/v1. */
  PUMP_API_ORIGIN?: string;
  /** pf_live_... key from https://developers.pump.fun (approved organisations only). */
  PUMP_API_KEY?: string;
}

/** `hybrid`: official spec merged with the community routes. `community`: community routes only. */
export type Mode = "hybrid" | "community";

export function modeOf(env: Env): Mode {
  return env.PUMP_OPENAPI_URL && env.PUMP_OPENAPI_URL.trim() !== "" ? "hybrid" : "community";
}
