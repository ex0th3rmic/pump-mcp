/**
 * On-chain pump.fun bonding-curve reads. No SDK: PDA derivation with noble, manual Borsh decode.
 * Layout per the Anchor IDL in github.com/pump-fun/pump-public-docs (idl/pump.json, BondingCurve).
 * Trailing fields were appended by later upgrades, so short accounts decode with defaults.
 */
import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import { base58 } from "@scure/base";

export const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
/** Pump coins have 6 decimals; SOL has 9. */
export const TOKEN_DECIMALS = 6;
/** Protocol fee on buys and sells (Global.fee_basis_points). Creator fee is not included. */
export const PROTOCOL_FEE_BPS = 100n;

const PDA_MARKER = new TextEncoder().encode("ProgramDerivedAddress");

export function isBase58Pubkey(s: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return false;
  try {
    return base58.decode(s).length === 32;
  } catch {
    return false;
  }
}

function isOnCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.ExtendedPoint.fromHex(bytes);
    return true;
  } catch {
    return false;
  }
}

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Equivalent of PublicKey.findProgramAddressSync. */
export function findProgramAddress(seeds: Uint8Array[], programId: string): { address: string; bump: number } {
  const program = base58.decode(programId);
  for (let bump = 255; bump >= 0; bump--) {
    const hash = sha256(concat([...seeds, new Uint8Array([bump]), program, PDA_MARKER]));
    if (!isOnCurve(hash)) return { address: base58.encode(hash), bump };
  }
  throw new Error("Unable to find a viable program address bump seed");
}

export function bondingCurveAddress(mint: string): string {
  return findProgramAddress([new TextEncoder().encode("bonding-curve"), base58.decode(mint)], PUMP_PROGRAM_ID).address;
}

export interface BondingCurve {
  virtualTokenReserves: bigint;
  /** Quote asset reserves: lamports for SOL-quoted coins, raw units of `quoteMint` otherwise. */
  virtualQuoteReserves: bigint;
  realTokenReserves: bigint;
  realQuoteReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
  creator: string | null;
  isMayhemMode: boolean;
  isCashbackCoin: boolean;
  /** null = SOL. */
  quoteMint: string | null;
  creatorFeeBps: bigint;
  isHolderReward: boolean;
  /** Accrued, unswept creator fee (raw quote units). */
  creatorFee: bigint;
  /** Accrued, unswept protocol fees (raw quote units). */
  protocolFees: bigint;
  /** Curve depth level (0 = classic). */
  depth: number;
  initialVirtualQuoteReserves: bigint;
  postCompleteBaseOut: bigint;
  postCompleteQuoteIn: bigint;
}

const ZERO_PUBKEY = base58.encode(new Uint8Array(32));

export function decodeBondingCurve(data: Uint8Array): BondingCurve {
  if (data.length < 8 + 5 * 8 + 1) throw new Error(`bonding curve account too short (${data.length} bytes)`);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let o = 8; // anchor discriminator
  const u64 = () => {
    const v = view.getBigUint64(o, true);
    o += 8;
    return v;
  };
  const bool = () => (o < data.length ? data[o++] !== 0 : false);
  const u64opt = () => (o + 8 <= data.length ? u64() : 0n);
  const u8opt = () => (o < data.length ? data[o++]! : 0);
  const pubkeyOpt = () => {
    if (o + 32 > data.length) return null;
    const k = base58.encode(data.subarray(o, o + 32));
    o += 32;
    return k === ZERO_PUBKEY ? null : k;
  };
  const c: BondingCurve = {
    virtualTokenReserves: u64(),
    virtualQuoteReserves: u64(),
    realTokenReserves: u64(),
    realQuoteReserves: u64(),
    tokenTotalSupply: u64(),
    complete: bool(),
    creator: pubkeyOpt(),
    isMayhemMode: bool(),
    isCashbackCoin: bool(),
    quoteMint: pubkeyOpt(),
    creatorFeeBps: u64opt(),
    isHolderReward: false,
    creatorFee: 0n,
    protocolFees: 0n,
    depth: 0,
    initialVirtualQuoteReserves: 0n,
    postCompleteBaseOut: 0n,
    postCompleteQuoteIn: 0n,
  };
  bool(); // can_edit_creator_fee (reserved, always false)
  c.isHolderReward = bool();
  c.creatorFee = u64opt();
  c.protocolFees = u64opt();
  c.depth = u8opt();
  c.initialVirtualQuoteReserves = u64opt();
  c.postCompleteBaseOut = u64opt();
  c.postCompleteQuoteIn = u64opt();
  return c;
}

/** Quote assets we can express in decimals. Anything else is reported in raw units only. */
const KNOWN_QUOTES: Record<string, { symbol: string; decimals: number }> = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: { symbol: "USDC", decimals: 6 },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: { symbol: "USDT", decimals: 6 },
  // pump.fun's own token; coins can be launched quoted in PUMP (seen on mainnet 2026-10).
  pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn: { symbol: "PUMP", decimals: 6 },
};

export function quoteInfo(c: BondingCurve): { mint: string | null; symbol: string; decimals: number | null } {
  if (!c.quoteMint) return { mint: null, symbol: "SOL", decimals: 9 };
  const known = KNOWN_QUOTES[c.quoteMint];
  return { mint: c.quoteMint, symbol: known?.symbol ?? "UNKNOWN", decimals: known?.decimals ?? null };
}

function units(raw: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = raw / base;
  const frac = (raw % base).toString().padStart(decimals, "0");
  return `${whole}.${frac}`;
}
const tokenStr = (raw: bigint) => units(raw, TOKEN_DECIMALS);

/** Tokens received for `quoteIn` raw quote units, protocol fee deducted first. Constant product on virtual reserves. */
export function quoteBuy(c: BondingCurve, quoteIn: bigint): { tokensOut: bigint; feeRaw: bigint } {
  const fee = (quoteIn * PROTOCOL_FEE_BPS) / 10_000n;
  const net = quoteIn - fee;
  const k = c.virtualQuoteReserves * c.virtualTokenReserves;
  const newQuote = c.virtualQuoteReserves + net;
  const newTokens = k / newQuote + 1n; // ceil
  let tokensOut = c.virtualTokenReserves - newTokens;
  if (tokensOut > c.realTokenReserves) tokensOut = c.realTokenReserves;
  if (tokensOut < 0n) tokensOut = 0n;
  return { tokensOut, feeRaw: fee };
}

/** Raw quote units received for `tokensIn` raw token units, protocol fee deducted from the output. */
export function quoteSell(c: BondingCurve, tokensIn: bigint): { quoteOut: bigint; feeRaw: bigint } {
  const k = c.virtualQuoteReserves * c.virtualTokenReserves;
  const newTokens = c.virtualTokenReserves + tokensIn;
  const gross = c.virtualQuoteReserves - k / newTokens;
  const fee = (gross * PROTOCOL_FEE_BPS) / 10_000n;
  return { quoteOut: gross - fee, feeRaw: fee };
}

export interface DescribeOptions {
  /** Whole quote units (SOL, USDC, ...) to quote a buy for. */
  buyAmount?: number;
  /** Whole tokens to quote a sell for. */
  sellTokens?: number;
}

export function describeCurve(mint: string, address: string, c: BondingCurve, opts: DescribeOptions = {}) {
  const quote = quoteInfo(c);
  const live = !c.complete && c.virtualQuoteReserves > 0n && c.virtualTokenReserves > 0n;
  const priced = live && quote.decimals !== null;
  // Mayhem mode: the program rewrites the virtual params over time (UpdateMayhemVirtualParams), so
  // the constant-product quote below does not hold. Spot price from reserves is still reported.
  const quotable = priced && !c.isMayhemMode;
  const qd = quote.decimals;
  // price in quote per whole token = (vQuote / 10^qd) / (vTok / 10^6)
  const priceInQuote = priced ? Number(c.virtualQuoteReserves) / 10 ** qd! / (Number(c.virtualTokenReserves) / 10 ** TOKEN_DECIMALS) : null;
  const marketCapInQuote = priceInQuote === null ? null : priceInQuote * (Number(c.tokenTotalSupply) / 10 ** TOKEN_DECIMALS);
  // Graduation: the curve completes when real_token_reserves hits 0. Progress is approximate: it
  // assumes the classic 793.1M initial real token reserve (Global.initial_real_token_reserves).
  const INITIAL_REAL_TOKENS = 793_100_000_000_000n;
  const sold = INITIAL_REAL_TOKENS > c.realTokenReserves ? INITIAL_REAL_TOKENS - c.realTokenReserves : 0n;
  const progress = c.complete ? 1 : Math.min(1, Number(sold) / Number(INITIAL_REAL_TOKENS));
  const q = (raw: bigint) => (qd === null ? null : units(raw, qd));
  const out: Record<string, unknown> = {
    mint,
    bondingCurve: address,
    program: PUMP_PROGRAM_ID,
    complete: c.complete,
    tradesOn: c.complete ? "pump-amm" : "pump",
    graduationProgress: Number(progress.toFixed(4)),
    quote,
    priceInQuote,
    marketCapInQuote,
    reserves: {
      virtualQuote: q(c.virtualQuoteReserves),
      virtualQuoteRaw: c.virtualQuoteReserves.toString(),
      virtualTokens: tokenStr(c.virtualTokenReserves),
      realQuote: q(c.realQuoteReserves),
      realQuoteRaw: c.realQuoteReserves.toString(),
      realTokens: tokenStr(c.realTokenReserves),
      totalSupply: tokenStr(c.tokenTotalSupply),
    },
    creator: c.creator,
    creatorFeeBps: Number(c.creatorFeeBps),
    isHolderReward: c.isHolderReward,
    isMayhemMode: c.isMayhemMode,
    depth: c.depth,
    initialVirtualQuote: q(c.initialVirtualQuoteReserves),
    unsweptFees: { creator: q(c.creatorFee), protocol: q(c.protocolFees) },
    note: c.complete
      ? "Curve graduated: reserves moved to a PumpSwap pool. Price and quotes are not available here; trade with pool=pump-amm (or auto)."
      : quote.decimals === null
        ? `Quote asset ${quote.mint} has unknown decimals: only raw units are reported, no price or quotes.`
        : c.isMayhemMode
          ? `Mayhem-mode coin priced in ${quote.symbol}: the program adjusts virtual params over time, so buy/sell quotes are not computed here. Use /trade with slippage, or simulate via /rpc.`
          : `Prices and amounts are in ${quote.symbol}. Quotes include the 1% protocol fee only; creator fee and slippage are extra.`,
  };
  if (quotable && opts.buyAmount !== undefined && Number.isFinite(opts.buyAmount) && opts.buyAmount > 0) {
    const raw = BigInt(Math.round(opts.buyAmount * 10 ** qd!));
    const r = quoteBuy(c, raw);
    out.buyQuote = { [`${quote.symbol.toLowerCase()}In`]: opts.buyAmount, tokensOut: tokenStr(r.tokensOut), tokensOutRaw: r.tokensOut.toString(), fee: units(r.feeRaw, qd!) };
  }
  if (quotable && opts.sellTokens !== undefined && Number.isFinite(opts.sellTokens) && opts.sellTokens > 0) {
    const raw = BigInt(Math.round(opts.sellTokens * 10 ** TOKEN_DECIMALS));
    const r = quoteSell(c, raw);
    out.sellQuote = { tokensIn: opts.sellTokens, [`${quote.symbol.toLowerCase()}Out`]: units(r.quoteOut, qd!), quoteOutRaw: r.quoteOut.toString(), fee: units(r.feeRaw, qd!) };
  }
  return out;
}
