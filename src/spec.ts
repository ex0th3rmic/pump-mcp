/**
 * OpenAPI 3.1 document that Code Mode turns into `codemode.spec()` / `codemode.request()`.
 *
 * This is OUR normalized surface over pump.fun, not an official document: developers.pump.fun has
 * not launched. Each path is routed to a real upstream by `src/upstreams.ts`:
 *   - /coins, /trades, /candlesticks, /replies, /balances, /sol-price -> pump.fun frontend API
 *     (unofficial, undocumented, can change without notice; the same API the website uses)
 *   - /trade (alias /trade/local)                                     -> pump.fun's official SDK, built here from chain state
 *   - /metadata                                                       -> IPFS pinning (PINATA_JWT)
 *   - /rpc                                                            -> Solana JSON-RPC (RPC_URL)
 *
 * Nothing here is secret: the sandbox can read this document and every response.
 */

const mintParam = {
  name: "mint",
  in: "path",
  required: true,
  description: "Token mint address (the last path segment of a pump.fun coin URL).",
  schema: { type: "string" },
};
const walletParam = {
  name: "wallet",
  in: "path",
  required: true,
  description: "Solana wallet address (base58).",
  schema: { type: "string" },
};
const paging = [
  { name: "offset", in: "query", schema: { type: "integer", minimum: 0, default: 0 } },
  { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 50, default: 50 } },
];
const sortParams = [
  {
    name: "sort",
    in: "query",
    schema: {
      type: "string",
      enum: ["market_cap", "last_trade_timestamp", "created_timestamp", "reply_count"],
      default: "market_cap",
    },
  },
  { name: "order", in: "query", schema: { type: "string", enum: ["ASC", "DESC"], default: "DESC" } },
  { name: "includeNsfw", in: "query", schema: { type: "boolean", default: false } },
];

const coin = {
  type: "object",
  description: "A pump.fun coin as returned by the frontend API. Fields are observed, not guaranteed.",
  properties: {
    mint: { type: "string" },
    name: { type: "string" },
    symbol: { type: "string" },
    description: { type: "string", nullable: true },
    image_uri: { type: "string", nullable: true },
    metadata_uri: { type: "string", nullable: true },
    twitter: { type: "string", nullable: true },
    telegram: { type: "string", nullable: true },
    website: { type: "string", nullable: true },
    creator: { type: "string" },
    created_timestamp: { type: "integer", description: "Unix ms" },
    bonding_curve: { type: "string" },
    associated_bonding_curve: { type: "string" },
    virtual_sol_reserves: { type: "integer" },
    virtual_token_reserves: { type: "integer" },
    total_supply: { type: "integer" },
    complete: { type: "boolean", description: "True once the curve graduated to PumpSwap." },
    raydium_pool: { type: "string", nullable: true },
    pump_swap_pool: { type: "string", nullable: true },
    market_cap: { type: "number", description: "In SOL" },
    usd_market_cap: { type: "number" },
    reply_count: { type: "integer" },
    last_trade_timestamp: { type: "integer", nullable: true },
    king_of_the_hill_timestamp: { type: "integer", nullable: true },
    nsfw: { type: "boolean" },
  },
};

const trade = {
  type: "object",
  properties: {
    signature: { type: "string" },
    mint: { type: "string" },
    sol_amount: { type: "integer", description: "lamports" },
    token_amount: { type: "integer", description: "raw token units (6 decimals)" },
    is_buy: { type: "boolean" },
    user: { type: "string" },
    timestamp: { type: "integer", description: "Unix seconds" },
    tx_index: { type: "integer" },
    slot: { type: "integer" },
  },
};

const tradeBody = {
  type: "object",
  required: ["publicKey", "action", "amount", "denominatedInSol", "slippage"],
  properties: {
    publicKey: { type: "string", description: "Wallet that signs and pays. For create, also the coin's creator (creator fees go to it)." },
    action: { type: "string", enum: ["buy", "sell", "create"] },
    mint: {
      type: "string",
      description:
        "Token mint. Required for buy and sell. For create, leave it out and the server generates a fresh mint, signs with it once, and returns its address; or pass a mint you generated yourself (e.g. a vanity ...pump address) and co-sign with it.",
    },
    amount: {
      oneOf: [{ type: "number" }, { type: "string" }],
      description:
        "buy: quote asset to spend (denominatedInSol=true) or tokens to receive. sell: tokens, or a percentage string such as \"100%\" of the wallet's balance. create: the dev buy in SOL (0 for none).",
    },
    denominatedInSol: { type: "boolean", description: "true when amount is in the quote asset (SOL for classic coins). Must be false for sell." },
    slippage: { type: "number", description: "Max slippage in percent, 0 to 99, e.g. 10" },
    priorityFee: { type: "number", description: "Priority fee in SOL, 0 to 0.1, e.g. 0.0001" },
    pool: {
      type: "string",
      enum: ["auto", "pump", "pump-amm"],
      default: "auto",
      description: "auto picks the bonding curve while the coin is on it and its PumpSwap pool after graduation.",
    },
    tokenMetadata: {
      type: "object",
      description: "Required for create.",
      required: ["name", "symbol", "uri"],
      properties: {
        name: { type: "string", description: "1 to 32 characters." },
        symbol: { type: "string", description: "1 to 10 characters." },
        uri: { type: "string", description: "Metadata JSON URI: the `uri` from POST /metadata, or your own https:// or ipfs:// link." },
      },
    },
    holderReward: { type: "boolean", description: "create only: route creator fees to holders instead of the creator. Set at creation." },
  },
};

const tradeResult = {
  type: "object",
  properties: {
    transaction: { type: "string", description: "base64 VersionedTransaction (v0), unsigned by the wallet." },
    encoding: { type: "string", enum: ["base64"] },
    bytes: { type: "integer" },
    action: { type: "string" },
    venue: { type: "string", enum: ["pump", "pump-amm"], description: "pump = bonding curve; pump-amm = PumpSwap pool after graduation." },
    mint: { type: "string", description: "The coin's mint. For create, the new coin's address." },
    quote: {
      type: "object",
      description: "Price at build time in whole units; the slippage bound is enforced on-chain.",
      properties: {
        quoteSymbol: { type: "string" },
        quoteIn: { oneOf: [{ type: "number" }, { type: "string" }] },
        tokensOut: { type: "string" },
        tokensIn: { type: "string" },
        quoteOut: { type: "string" },
        slippagePct: { type: "number" },
      },
    },
    requiredSigners: { type: "array", items: { type: "string" } },
    signedBy: { type: "array", items: { type: "string" }, description: "Signatures already present (the server-generated mint on create)." },
    lastValidBlockHeight: { type: "integer" },
    lookupTablesUsed: { type: "array", items: { type: "string" } },
    note: { type: "string" },
  },
};

const tradeOperation = (operationId: string, extra: Record<string, unknown> = {}) => ({
  operationId,
  tags: ["trading"],
  summary: "Build an UNSIGNED buy, sell or create transaction with pump.fun's official SDK.",
  description:
    "Reads the coin's bonding curve (or its PumpSwap pool after graduation) from chain, prices the trade, and returns a base64 v0 transaction for `publicKey` to sign. Nothing is sent. Sign with the wallet, then broadcast with POST /rpc sendTransaction. Needs RPC_URL. Create with a dev buy needs the operator's lookup table (LOOKUP_TABLES); without one, create with amount 0, send it, then buy.",
  requestBody: { required: true, content: { "application/json": { schema: tradeBody } } },
  responses: { "200": { description: "Unsigned transaction and quote", content: { "application/json": { schema: tradeResult } } } },
  ...extra,
});

export const communitySpec: Record<string, unknown> = {
  openapi: "3.1.0",
  info: {
    title: "pump.fun (community surface)",
    version: "0.1.0",
    description: [
      "Normalized API over pump.fun while developers.pump.fun is not yet available.",
      "Market-data paths proxy the unofficial frontend API the pump.fun website uses; they are",
      "undocumented and may change or rate-limit without notice. POST /trade builds an UNSIGNED",
      "transaction with pump.fun's official SDK from live chain state: the user signs it with their own",
      "wallet and broadcasts it (optionally via POST /rpc sendTransaction). POST /metadata pins a new",
      "coin's image and metadata to IPFS and returns the uri that create needs.",
      "Amounts from the frontend API are raw integers: lamports for SOL, 6-decimal units for tokens.",
      "Always filter and aggregate in code before returning: responses over ~6k tokens are truncated.",
    ].join(" "),
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "coins", description: "Discover coins (unofficial frontend API)." },
    { name: "trades", description: "Trade history and candles (unofficial frontend API)." },
    { name: "wallets", description: "Per-wallet holdings and creations (unofficial frontend API)." },
    { name: "trading", description: "Build unsigned buy/sell/create transactions with pump.fun's official SDK, and pin new coins' metadata." },
    { name: "chain", description: "On-chain reads (bonding curve) and allow-listed Solana JSON-RPC passthrough." },
  ],
  paths: {
    "/coins": {
      get: {
        operationId: "listCoins",
        tags: ["coins"],
        summary: "List coins sorted by market cap, recency, activity or replies.",
        parameters: [...paging, ...sortParams],
        responses: { "200": { description: "Array of coins", content: { "application/json": { schema: { type: "array", items: coin } } } } },
      },
    },
    "/coins/search": {
      get: {
        operationId: "searchCoins",
        tags: ["coins"],
        summary: "Full-text search over name, symbol, description and mint.",
        parameters: [
          { name: "searchTerm", in: "query", required: true, schema: { type: "string" } },
          ...paging,
          ...sortParams,
        ],
        responses: { "200": { description: "Array of coins", content: { "application/json": { schema: { type: "array", items: coin } } } } },
      },
    },
    "/coins/latest": {
      get: {
        operationId: "latestCoin",
        tags: ["coins"],
        summary: "The most recently created coin.",
        responses: { "200": { description: "Coin", content: { "application/json": { schema: coin } } } },
      },
    },
    "/coins/currently-live": {
      get: {
        operationId: "currentlyLiveCoins",
        tags: ["coins"],
        summary: "Coins whose creator is livestreaming right now.",
        parameters: [...paging, { name: "includeNsfw", in: "query", schema: { type: "boolean", default: false } }],
        responses: { "200": { description: "Array of coins", content: { "application/json": { schema: { type: "array", items: coin } } } } },
      },
    },
    "/coins/king-of-the-hill": {
      get: {
        operationId: "kingOfTheHill",
        tags: ["coins"],
        summary: "The coin currently holding King of the Hill.",
        parameters: [{ name: "includeNsfw", in: "query", schema: { type: "boolean", default: false } }],
        responses: { "200": { description: "Coin", content: { "application/json": { schema: coin } } } },
      },
    },
    "/coins/{mint}": {
      get: {
        operationId: "getCoin",
        tags: ["coins"],
        summary: "Coin detail: metadata, bonding-curve reserves, market cap, graduation status.",
        parameters: [mintParam],
        responses: { "200": { description: "Coin", content: { "application/json": { schema: coin } } } },
      },
    },
    "/coins/user-created-coins/{wallet}": {
      get: {
        operationId: "coinsCreatedBy",
        tags: ["wallets"],
        summary: "Coins created by a wallet.",
        parameters: [walletParam, ...paging, { name: "includeNsfw", in: "query", schema: { type: "boolean", default: true } }],
        responses: { "200": { description: "Array of coins", content: { "application/json": { schema: { type: "array", items: coin } } } } },
      },
    },
    "/trades/all/{mint}": {
      get: {
        operationId: "listTrades",
        tags: ["trades"],
        summary: "Recent trades for a coin, newest first.",
        parameters: [
          mintParam,
          ...paging.map((p) => (p.name === "limit" ? { ...p, schema: { ...p.schema, maximum: 200, default: 200 } } : p)),
          { name: "minimumSize", in: "query", schema: { type: "integer", default: 0 }, description: "Minimum token_amount (raw units)" },
        ],
        responses: { "200": { description: "Array of trades", content: { "application/json": { schema: { type: "array", items: trade } } } } },
      },
    },
    "/trades/latest": {
      get: {
        operationId: "latestTrade",
        tags: ["trades"],
        summary: "The most recent trade on the platform.",
        responses: { "200": { description: "Trade", content: { "application/json": { schema: trade } } } },
      },
    },
    "/candlesticks/{mint}": {
      get: {
        operationId: "candles",
        tags: ["trades"],
        summary: "OHLCV candles for a coin.",
        parameters: [
          mintParam,
          { name: "offset", in: "query", schema: { type: "integer", default: 0 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 1000, maximum: 1000 } },
          { name: "timeframe", in: "query", schema: { type: "integer", default: 5 }, description: "Candle size in minutes" },
        ],
        responses: {
          "200": {
            description: "Array of candles",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      mint: { type: "string" },
                      timestamp: { type: "integer" },
                      open: { type: "number" },
                      high: { type: "number" },
                      low: { type: "number" },
                      close: { type: "number" },
                      volume: { type: "number" },
                      slot: { type: "integer" },
                      is_5_min: { type: "boolean" },
                      is_1_min: { type: "boolean" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/replies/{mint}": {
      get: {
        operationId: "listReplies",
        tags: ["coins"],
        summary: "Comment thread for a coin.",
        parameters: [mintParam, ...paging],
        responses: { "200": { description: "Replies page", content: { "application/json": { schema: { type: "object" } } } } },
      },
    },
    "/balances/{wallet}": {
      get: {
        operationId: "walletBalances",
        tags: ["wallets"],
        summary: "pump.fun token balances held by a wallet.",
        parameters: [walletParam, ...paging, { name: "minBalance", in: "query", schema: { type: "integer", default: -1 } }],
        responses: { "200": { description: "Array of holdings", content: { "application/json": { schema: { type: "array", items: { type: "object" } } } } } },
      },
    },
    "/sol-price": {
      get: {
        operationId: "solPrice",
        tags: ["coins"],
        summary: "Current SOL/USD price used by pump.fun.",
        responses: { "200": { description: "Price", content: { "application/json": { schema: { type: "object", properties: { solPrice: { type: "number" } } } } } } },
      },
    },
    "/trade": { post: tradeOperation("buildTrade") },
    "/trade/local": {
      post: tradeOperation("buildTradeLegacy", {
        deprecated: true,
        summary: "Alias of POST /trade, kept for code written against the earlier route.",
      }),
    },
    "/metadata": {
      post: {
        operationId: "pinCoinMetadata",
        tags: ["trading"],
        summary: "Pin a new coin's image and metadata JSON to IPFS; returns the uri for POST /trade create.",
        description:
          "The image goes inline as a base64 data URL (png, jpeg, gif or webp, 2 MB max); the server never fetches image URLs. Needs PINATA_JWT on the server; otherwise NOT_CONFIGURED, and you can host the JSON yourself and pass its uri to create.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "symbol", "image"],
                properties: {
                  name: { type: "string", description: "1 to 32 characters." },
                  symbol: { type: "string", description: "1 to 10 characters." },
                  description: { type: "string", description: "Up to 1000 characters." },
                  image: { type: "string", description: "data:image/png;base64,..." },
                  website: { type: "string", description: "https:// link" },
                  twitter: { type: "string", description: "https:// link" },
                  telegram: { type: "string", description: "https:// link" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "IPFS links",
            content: {
              "application/json": {
                schema: { type: "object", properties: { uri: { type: "string" }, image: { type: "string" }, metadata: { type: "object" } } },
              },
            },
          },
        },
      },
    },
    "/curve/{mint}": {
      get: {
        operationId: "getBondingCurve",
        tags: ["chain"],
        summary: "Read a coin's bonding curve straight from chain: reserves, price, market cap, graduation progress, buy/sell quotes.",
        description:
          "Derives the bonding-curve PDA and decodes the account via RPC. Works even when the frontend API is unavailable. Requires RPC_URL on the server. The quote asset is SOL for classic coins and USDC for Mayhem-mode coins; `quote` in the response says which, and all prices/amounts are in that asset. Add buyAmount / sellTokens to get quotes (1% protocol fee included, creator fee and slippage excluded).",
        parameters: [
          mintParam,
          { name: "buyAmount", in: "query", schema: { type: "number" }, description: "Quote how many tokens this much of the quote asset (SOL or USDC) buys." },
          { name: "sellTokens", in: "query", schema: { type: "number" }, description: "Quote how much of the quote asset this many whole tokens sell for." },
        ],
        responses: {
          "200": {
            description: "Decoded curve",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    mint: { type: "string" },
                    bondingCurve: { type: "string" },
                    complete: { type: "boolean" },
                    graduationProgress: { type: "number", description: "0..1" },
                    quote: { type: "object", properties: { mint: { type: "string", nullable: true }, symbol: { type: "string" }, decimals: { type: "integer", nullable: true } } },
                    priceInQuote: { type: "number", nullable: true, description: "Quote asset per whole token" },
                    marketCapInQuote: { type: "number", nullable: true },
                    reserves: { type: "object" },
                    isMayhemMode: { type: "boolean" },
                    creator: { type: "string", nullable: true },
                    creatorFeeBps: { type: "integer" },
                    isHolderReward: { type: "boolean" },
                    buyQuote: { type: "object" },
                    sellQuote: { type: "object" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/rpc": {
      post: {
        operationId: "solanaRpc",
        tags: ["chain"],
        summary: "Call an allow-listed Solana JSON-RPC method (getAccountInfo, getBalance, getTransaction, sendTransaction, simulateTransaction, ...).",
        description:
          "Use this to read bonding-curve accounts directly, confirm signatures, or broadcast a transaction the user signed. Requires the server to be configured with RPC_URL. Returns the JSON-RPC `result` (or throws the JSON-RPC error).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["method"],
                properties: {
                  method: { type: "string" },
                  params: { type: "array", items: {} },
                },
              },
            },
          },
        },
        responses: { "200": { description: "JSON-RPC result", content: { "application/json": { schema: {} } } } },
      },
    },
  },
};
