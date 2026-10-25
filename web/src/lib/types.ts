/** GET /health */
export interface Health {
  ok: boolean;
  version: string;
  mode: "hybrid" | "community";
  officialKey: boolean;
  rpc: boolean;
  lightning: boolean;
  auth: boolean;
}

/** GET /api/showcase: the subset of describeCurve() the page draws. */
export interface Showcase {
  mint: string;
  complete: boolean;
  graduationProgress: number;
  quote: { symbol: string; decimals: number | null };
  priceInQuote: number | null;
  marketCapInQuote: number | null;
  /** Decimal string from the Worker (bigint-safe), e.g. "30.000000000". */
  initialVirtualQuote: string | number | null;
  isMayhemMode: boolean;
  reserves: { realQuote: string | number | null };
}
