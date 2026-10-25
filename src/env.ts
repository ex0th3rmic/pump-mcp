export interface Env {
  /** Worker Loader binding: spawns the sandbox that runs model-written code. */
  LOADER: WorkerLoader;
  /** Static web app in ./public (optional: the API works without it). */
  ASSETS?: Fetcher;
  /** Required. Clients send `Authorization: Bearer <MCP_BEARER_TOKEN>` to /mcp. */
  MCP_BEARER_TOKEN?: string;

  // Community mode (developers.pump.fun not yet available)
  PUMP_FRONTEND_API_ORIGIN?: string;
  PUMPPORTAL_ORIGIN?: string;
  PUMPPORTAL_API_KEY?: string;
  RPC_URL?: string;
  RPC_ALLOWED_METHODS?: string;
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
