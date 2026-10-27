/** GET /health */
export interface Health {
  ok: boolean;
  version: string;
  mode: "hybrid" | "community";
  officialKey: boolean;
  rpc: boolean;
  metadataUpload: boolean;
  devBuyInCreate: boolean;
  auth: boolean;
  cluster: "mainnet-beta" | "devnet";
}

export interface CurveData extends Showcase {
  curve: string;
  /** Bonding curve account address, as /curve returns it. */
  bondingCurve?: string;
  creatorFeeBps?: number;
  creator: string;
  tradesOn: "pump" | "pump-amm" | string;
  note?: string;
  buyQuote?: {
    tokensOut?: string;
    quoteIn?: number | string;
    /** SOL-quoted curves report the input as solIn. */
    solIn?: number | string;
    fee?: string | number;
  } | null;
  sellQuote?: Record<string, string | number | null> | null;
  /** /api/showcase only: when the Worker read this from chain (ISO time; survives the 20s edge cache). */
  asOf?: string;
}

export interface TradeQuote {
  quoteSymbol: string;
  quoteIn?: number | string;
  tokensOut?: string;
  tokensIn?: string;
  quoteOut?: string;
  slippagePct: number;
}

export interface TradeResult {
  transaction: string;
  encoding: "base64";
  bytes: number;
  action: "buy" | "sell" | "create";
  venue: "pump" | "pump-amm";
  mint: string;
  quote: TradeQuote;
  requiredSigners: string[];
  signedBy: string[];
  lastValidBlockHeight: number;
  lookupTablesUsed: string[];
  note: string;
}

export interface MetadataResult {
  uri: string;
  image: string;
  metadata: Record<string, unknown>;
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
  reserves: {
    realQuote: string | number | null;
    realTokens?: string | number | null;
    virtualQuote?: string | number | null;
    virtualTokens?: string | number | null;
    totalSupply?: string | number | null;
  };
}
