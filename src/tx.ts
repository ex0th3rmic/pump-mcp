/**
 * Builds UNSIGNED pump.fun transactions with pump.fun's official SDK (`@pump-fun/pump-sdk`).
 *
 * - buy / sell on the bonding curve use the v3 instructions; once a coin has graduated the same
 *   request routes to its PumpSwap pool (`@pump-fun/pump-sdk/swap`).
 * - create uses `create_v2`. Without a `mint`, a fresh mint keypair is generated here, signs once, and
 *   is dropped: the response carries the mint address only, never its secret. A caller-supplied mint
 *   (e.g. a vanity "...pump" address) is left for the caller to co-sign.
 *
 * Nothing is sent on-chain. The caller's wallet signs and broadcasts.
 */
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import { NATIVE_MINT, getAssociatedTokenAddressSync } from "@solana/spl-token";
import BN from "bn.js";
import {
  CashbackCoinNotSupportedError,
  OnlinePumpSdk,
  PUMP_SDK,
  canonicalPumpPoolPda,
  canonicalPumpPoolPdaWithQuote,
  getBuyTokenAmountFromSolAmount,
  getBuyV3QuoteAmountFromTokenAmount,
  getBuyV3TokenAmountFromQuoteAmount,
  getSellSolAmountFromTokenAmount,
} from "@pump-fun/pump-sdk";
import { OnlinePumpAmmSdk, PUMP_AMM_SDK } from "@pump-fun/pump-sdk/swap";

export type TradeErrorCode = "BAD_REQUEST" | "NOT_CONFIGURED" | "NOT_FOUND" | "UPSTREAM";
export class TradeError extends Error {
  constructor(
    message: string,
    readonly code: TradeErrorCode,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TradeError";
  }
}

export interface TradeDeps {
  rpcUrl: string | undefined;
  /**
   * Address lookup tables to compile with when a transaction is too big to list every account inline
   * (create + dev buy, PumpSwap trades). Lookup tables are append-only, so a table can never change
   * what an index points to: a third-party table can only fail closed, never redirect a trade.
   */
  lookupTables?: Array<string | AddressLookupTableAccount>;
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
}

export interface TradeQuote {
  quoteSymbol: string;
  /** What leaves the wallet on a buy, in whole quote units (SOL for classic coins). */
  quoteIn?: number | string;
  /** Tokens a buy is priced to receive, in whole tokens. */
  tokensOut?: string;
  /** Tokens a sell gives up, in whole tokens. */
  tokensIn?: string;
  /** What a sell is priced to pay out, in whole quote units. */
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
  /** Lookup tables the transaction references, if it needed any to fit. */
  lookupTablesUsed: string[];
  note: string;
}

const MAX_TX_BYTES = 1232;
const CU_LIMIT = { curve: 200_000, amm: 250_000, create: 350_000 } as const;
const VENUES = new Set(["auto", "pump", "pump-amm"]);
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// ---- validation -------------------------------------------------------------------------------

interface Parsed {
  action: "buy" | "sell" | "create";
  user: PublicKey;
  mint: PublicKey | null;
  amount: number;
  percent: number | null;
  denominatedInSol: boolean;
  slippage: number;
  priorityFee: number;
  pool: "auto" | "pump" | "pump-amm";
  meta: { name: string; symbol: string; uri: string } | null;
  holderReward: boolean;
}

const bad = (m: string) => new TradeError(m, "BAD_REQUEST");

function pubkey(v: unknown, field: string): PublicKey {
  if (typeof v !== "string" || !BASE58.test(v)) throw bad(`${field} must be a base58 public key`);
  try {
    return new PublicKey(v);
  } catch {
    throw bad(`${field} must be a base58 public key`);
  }
}

export function parseTradeBody(body: unknown): Parsed {
  if (!body || typeof body !== "object") throw bad("trade body must be an object");
  const b = body as Record<string, unknown>;
  const action = b.action;
  if (action !== "buy" && action !== "sell" && action !== "create") throw bad("action must be buy, sell or create");
  const user = pubkey(b.publicKey, "publicKey");
  const mint = action === "create" && (b.mint === undefined || b.mint === null || b.mint === "") ? null : pubkey(b.mint, "mint");

  const denominatedInSol = b.denominatedInSol === true || b.denominatedInSol === "true";
  if (action === "sell" && denominatedInSol) throw bad("sell takes a token amount or a percentage such as \"100%\", not a SOL amount");

  let amount = NaN;
  let percent: number | null = null;
  if (typeof b.amount === "string" && /^\d+(\.\d+)?%$/.test(b.amount.trim())) {
    if (action !== "sell") throw bad("percent amounts are only for sell");
    percent = Number(b.amount.trim().slice(0, -1));
    if (!(percent > 0 && percent <= 100)) throw bad("percent must be between 0 and 100");
  } else {
    amount = Number(b.amount);
    const min = action === "create" ? 0 : Number.MIN_VALUE;
    if (!Number.isFinite(amount) || amount < min) throw bad(action === "create" ? "amount (dev buy) must be 0 or more" : "amount must be a positive number");
  }

  const slippage = Number(b.slippage ?? 10);
  if (!Number.isFinite(slippage) || slippage < 0 || slippage >= 100) throw bad("slippage is a percent from 0 to 99");
  const priorityFee = Number(b.priorityFee ?? 0);
  if (!Number.isFinite(priorityFee) || priorityFee < 0 || priorityFee > 0.1) throw bad("priorityFee is in SOL, from 0 to 0.1");

  const pool = (typeof b.pool === "string" ? b.pool : "auto") as Parsed["pool"];
  if (!VENUES.has(pool)) throw bad("pool must be auto, pump or pump-amm");

  let meta: Parsed["meta"] = null;
  if (action === "create") {
    const m = b.tokenMetadata as Record<string, unknown> | undefined;
    if (!m || typeof m.name !== "string" || typeof m.symbol !== "string" || typeof m.uri !== "string") {
      throw bad("tokenMetadata {name, symbol, uri} is required for create; POST /metadata returns a uri");
    }
    if (!m.name.trim() || m.name.length > 32) throw bad("tokenMetadata.name must be 1 to 32 characters");
    if (!m.symbol.trim() || m.symbol.length > 10) throw bad("tokenMetadata.symbol must be 1 to 10 characters");
    if (!/^(https:\/\/|ipfs:\/\/)/.test(m.uri) || m.uri.length > 200) throw bad("tokenMetadata.uri must be an https:// or ipfs:// URI under 200 characters");
    meta = { name: m.name, symbol: m.symbol, uri: m.uri };
  }

  return { action, user, mint, amount, percent, denominatedInSol, slippage, priorityFee, pool, meta, holderReward: b.holderReward === true };
}

// ---- units ------------------------------------------------------------------------------------

function toRaw(n: number, decimals: number): BN {
  const [i, f = ""] = n.toFixed(decimals).split(".");
  return new BN((i ?? "0") + f.padEnd(decimals, "0").slice(0, decimals));
}

function fromRaw(raw: BN, decimals: number): string {
  const s = raw.toString().padStart(decimals + 1, "0");
  if (decimals === 0) return s;
  const int = s.slice(0, -decimals);
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

interface MintInfo {
  tokenProgram: PublicKey;
  supply: BN;
  decimals: number;
}

async function mintInfo(connection: Connection, mint: PublicKey): Promise<MintInfo> {
  const acc = await connection.getAccountInfo(mint, "confirmed");
  if (!acc) throw new TradeError(`mint ${mint.toBase58()} not found on chain`, "NOT_FOUND", 404);
  const d = acc.data;
  // SPL / Token-2022 mint base layout: supply u64 at 36, decimals u8 at 44.
  return { tokenProgram: acc.owner, supply: new BN(d.subarray(36, 44), "le"), decimals: d[44]! };
}

async function quoteDecimals(connection: Connection, quoteMint: PublicKey): Promise<{ decimals: number; symbol: string }> {
  if (quoteMint.equals(NATIVE_MINT) || quoteMint.equals(PublicKey.default)) return { decimals: 9, symbol: "SOL" };
  const info = await mintInfo(connection, quoteMint);
  return { decimals: info.decimals, symbol: quoteMint.toBase58().slice(0, 4) + "…" };
}

// ---- builders ---------------------------------------------------------------------------------

async function loadLookupTables(connection: Connection, tables: Array<string | AddressLookupTableAccount>): Promise<AddressLookupTableAccount[]> {
  const out: AddressLookupTableAccount[] = [];
  for (const a of tables) {
    if (a instanceof AddressLookupTableAccount) {
      if (a.isActive()) out.push(a);
      continue;
    }
    const res = await connection.getAddressLookupTable(new PublicKey(a), { commitment: "confirmed" });
    if (res.value && res.value.isActive()) out.push(res.value);
  }
  return out;
}

function signAndSerializeOrNull(tx: VersionedTransaction, signer: Keypair | null): Uint8Array | null {
  try {
    if (signer) tx.sign([signer]); // signing serializes the message, so it can overrun too
    const raw = tx.serialize();
    return raw.length <= MAX_TX_BYTES ? raw : null;
  } catch (e) {
    if (e instanceof RangeError) return null; // web3.js overruns its 1232-byte buffer
    throw e;
  }
}

async function finish(
  connection: Connection,
  p: Parsed,
  ixs: TransactionInstruction[],
  cuLimit: number,
  extraSigner: Keypair | null,
  lookupTables: Array<string | AddressLookupTableAccount> = [],
): Promise<{ transaction: string; bytes: number; requiredSigners: string[]; signedBy: string[]; lastValidBlockHeight: number; lookupTablesUsed: string[] }> {
  const budget = [ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit })];
  if (p.priorityFee > 0) {
    const microLamports = Math.floor((p.priorityFee * 1e9 * 1e6) / cuLimit);
    budget.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports }));
  }
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const instructions = [...budget, ...ixs];
  const compile = (tables: AddressLookupTableAccount[]) => {
    const message = new TransactionMessage({ payerKey: p.user, recentBlockhash: blockhash, instructions }).compileToV0Message(tables);
    const tx = new VersionedTransaction(message);
    return { message, raw: signAndSerializeOrNull(tx, extraSigner) };
  };
  let used: AddressLookupTableAccount[] = [];
  let { message, raw } = compile(used);
  if (!raw && lookupTables.length) {
    used = await loadLookupTables(connection, lookupTables);
    ({ message, raw } = compile(used));
  }
  if (!raw) {
    const hint =
      p.action === "create"
        ? " A create with a dev buy needs a lookup table: the operator sets LOOKUP_TABLES (made once with `bun run lookup-table`). Without one, create with amount 0, send it, then buy in a second call."
        : "";
    throw new TradeError(
      `transaction does not fit Solana's ${MAX_TX_BYTES}-byte limit${lookupTables.length ? " even with the configured lookup tables" : " without a lookup table (LOOKUP_TABLES)"}.${hint}`,
      "UPSTREAM",
    );
  }
  const keys = message.staticAccountKeys.slice(0, message.header.numRequiredSignatures).map((k) => k.toBase58());
  return {
    transaction: Buffer.from(raw).toString("base64"),
    bytes: raw.length,
    requiredSigners: keys,
    signedBy: extraSigner ? [extraSigner.publicKey.toBase58()] : [],
    lastValidBlockHeight,
    lookupTablesUsed: used.map((t) => t.key.toBase58()),
  };
}

async function userTokenBalance(connection: Connection, mint: PublicKey, user: PublicKey, tokenProgram: PublicKey): Promise<BN> {
  const ata = getAssociatedTokenAddressSync(mint, user, true, tokenProgram);
  try {
    const bal = await connection.getTokenAccountBalance(ata, "confirmed");
    return new BN(bal.value.amount);
  } catch {
    throw new TradeError(`${user.toBase58()} holds no ${mint.toBase58()}`, "NOT_FOUND", 404);
  }
}

export async function buildTrade(body: unknown, deps: TradeDeps): Promise<TradeResult> {
  const p = parseTradeBody(body);
  if (!deps.rpcUrl) throw new TradeError("Trading needs RPC_URL on this server (transactions are built from live chain state)", "NOT_CONFIGURED");
  const connection = new Connection(deps.rpcUrl, {
    commitment: "confirmed",
    ...(deps.fetchImpl ? { fetch: deps.fetchImpl as unknown as typeof fetch } : {}),
  });
  const tables = deps.lookupTables ?? [];
  try {
    if (p.action === "create") return await buildCreate(connection, p, tables);
    return await buildSwap(connection, p, tables);
  } catch (e) {
    if (e instanceof TradeError) throw e;
    if (e instanceof CashbackCoinNotSupportedError) throw bad("this is a legacy cashback coin; trading those isn't supported here yet");
    throw new TradeError(`could not build the transaction: ${e instanceof Error ? e.message : String(e)}`, "UPSTREAM");
  }
}

async function buildSwap(connection: Connection, p: Parsed, tables: Array<string | AddressLookupTableAccount>): Promise<TradeResult> {
  const mint = p.mint!;
  const sdk = new OnlinePumpSdk(connection);
  const [mi, curve] = await Promise.all([mintInfo(connection, mint), sdk.fetchBondingCurve(mint).catch(() => null)]);
  if (!curve) throw new TradeError(`${mint.toBase58()} has no pump.fun bonding curve`, "NOT_FOUND", 404);

  const graduated = curve.complete;
  if (p.pool === "pump" && graduated) throw bad("this coin has graduated; its trades are on PumpSwap (pool: auto or pump-amm)");
  if (p.pool === "pump-amm" && !graduated) throw bad("this coin is still on its bonding curve (pool: auto or pump)");

  const quoteMint = curve.quoteMint && !curve.quoteMint.equals(PublicKey.default) ? curve.quoteMint : NATIVE_MINT;
  const q = await quoteDecimals(connection, quoteMint);
  const base = { action: p.action, mint: mint.toBase58() } as const;

  if (graduated) {
    const amm = new OnlinePumpAmmSdk(connection);
    const poolKey = quoteMint.equals(NATIVE_MINT) ? canonicalPumpPoolPda(mint) : canonicalPumpPoolPdaWithQuote(mint, quoteMint);
    const state = await amm.swapSolanaState(poolKey, p.user).catch((e: unknown) => {
      if (e instanceof Error && /Pool account not found/.test(e.message)) {
        throw new TradeError(`${mint.toBase58()} graduated but has no PumpSwap pool; it likely migrated to Raydium before PumpSwap existed`, "NOT_FOUND", 404);
      }
      throw e;
    });
    let ixs: TransactionInstruction[];
    const quote: TradeQuote = { quoteSymbol: q.symbol, slippagePct: p.slippage };
    if (p.action === "buy") {
      if (p.denominatedInSol) {
        ixs = await PUMP_AMM_SDK.buyQuoteInput(state, toRaw(p.amount, q.decimals), p.slippage);
        quote.quoteIn = p.amount;
      } else {
        const tokens = toRaw(p.amount, mi.decimals);
        ixs = await PUMP_AMM_SDK.buyBaseInput(state, tokens, p.slippage);
        quote.tokensOut = fromRaw(tokens, mi.decimals);
      }
    } else {
      const tokens = p.percent !== null ? (await userTokenBalance(connection, mint, p.user, mi.tokenProgram)).muln(Math.round(p.percent * 100)).divn(10_000) : toRaw(p.amount, mi.decimals);
      if (tokens.isZero()) throw bad("nothing to sell");
      ixs = await PUMP_AMM_SDK.sellBaseInput(state, tokens, p.slippage);
      quote.tokensIn = fromRaw(tokens, mi.decimals);
    }
    const built = await finish(connection, p, ixs, CU_LIMIT.amm, null, tables);
    return { ...built, ...base, encoding: "base64", venue: "pump-amm", quote, note: "Priced from the PumpSwap pool at build time; the slippage bound is enforced on-chain. Sign with your wallet, then broadcast (POST /rpc sendTransaction)." };
  }

  const [global, feeConfig] = await Promise.all([sdk.fetchGlobal(), sdk.fetchFeeConfig()]);
  if (p.action === "buy") {
    const s = await sdk.fetchBuyState(mint, p.user, mi.tokenProgram, quoteMint);
    const common = { global, feeConfig, mintSupply: mi.supply, bondingCurve: s.bondingCurve, curveBaseTokenBalance: s.curveBaseTokenBalance, quoteTransferFee: s.quoteTransferFee };
    let ixs: TransactionInstruction[];
    const quote: TradeQuote = { quoteSymbol: q.symbol, slippagePct: p.slippage };
    if (p.denominatedInSol) {
      const quoteAmount = toRaw(p.amount, q.decimals);
      const tokens = getBuyV3TokenAmountFromQuoteAmount({ ...common, amount: quoteAmount });
      if (tokens.isZero()) throw bad("that amount buys zero tokens");
      ixs = await PUMP_SDK.buyExactQuoteInV3Instructions({
        bondingCurve: s.bondingCurve, associatedUserAccountInfo: s.associatedUserAccountInfo, mint, user: p.user,
        amount: tokens, quoteAmount, slippage: p.slippage, tokenProgram: mi.tokenProgram, quoteTokenProgram: s.quoteTokenProgram,
      });
      quote.quoteIn = p.amount;
      quote.tokensOut = fromRaw(tokens, mi.decimals);
    } else {
      const tokens = toRaw(p.amount, mi.decimals);
      const quoteAmount = getBuyV3QuoteAmountFromTokenAmount({ ...common, amount: tokens });
      ixs = await PUMP_SDK.buyV3Instructions({
        bondingCurve: s.bondingCurve, associatedUserAccountInfo: s.associatedUserAccountInfo, mint, user: p.user,
        amount: tokens, quoteAmount, slippage: p.slippage, tokenProgram: mi.tokenProgram, quoteTokenProgram: s.quoteTokenProgram,
      });
      quote.tokensOut = fromRaw(tokens, mi.decimals);
      quote.quoteIn = fromRaw(quoteAmount, q.decimals);
    }
    const built = await finish(connection, p, ixs, CU_LIMIT.curve, null, tables);
    return { ...built, ...base, encoding: "base64", venue: "pump", quote, note: "Priced from the bonding curve at build time, protocol and creator fees included; the slippage bound is enforced on-chain. Sign with your wallet, then broadcast (POST /rpc sendTransaction)." };
  }

  // sell on the curve
  const s = await sdk.fetchSellState(mint, p.user, mi.tokenProgram, quoteMint);
  const tokens = p.percent !== null ? (await userTokenBalance(connection, mint, p.user, mi.tokenProgram)).muln(Math.round(p.percent * 100)).divn(10_000) : toRaw(p.amount, mi.decimals);
  if (tokens.isZero()) throw bad("nothing to sell");
  const quoteOut = getSellSolAmountFromTokenAmount({ global, feeConfig, mintSupply: mi.supply, bondingCurve: s.bondingCurve, amount: tokens, quoteTransferFee: s.quoteTransferFee });
  const ixs = await PUMP_SDK.sellV3Instructions({
    bondingCurve: s.bondingCurve, mint, user: p.user, amount: tokens, quoteAmount: quoteOut, slippage: p.slippage,
    tokenProgram: mi.tokenProgram, quoteTokenProgram: s.quoteTokenProgram,
  });
  const built = await finish(connection, p, ixs, CU_LIMIT.curve, null, tables);
  return {
    ...built, ...base, encoding: "base64", venue: "pump",
    quote: { quoteSymbol: q.symbol, tokensIn: fromRaw(tokens, mi.decimals), quoteOut: fromRaw(quoteOut, q.decimals), slippagePct: p.slippage },
    note: "Priced from the bonding curve at build time, fees included; the minimum payout (less slippage) is enforced on-chain. Sign with your wallet, then broadcast (POST /rpc sendTransaction).",
  };
}

async function buildCreate(connection: Connection, p: Parsed, tables: Array<string | AddressLookupTableAccount>): Promise<TradeResult> {
  const sdk = new OnlinePumpSdk(connection);
  const mintKeypair = p.mint ? null : Keypair.generate();
  const mint = p.mint ?? mintKeypair!.publicKey;
  const meta = p.meta!;
  const global = await sdk.fetchGlobal();
  const TOKEN_DECIMALS = 6;
  let ixs: TransactionInstruction[];
  const quote: TradeQuote = { quoteSymbol: "SOL", slippagePct: p.slippage };

  if (p.amount > 0) {
    const feeConfig = await sdk.fetchFeeConfig();
    let quoteAmount: BN;
    let tokens: BN;
    if (p.denominatedInSol) {
      quoteAmount = toRaw(p.amount, 9);
      tokens = getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: quoteAmount, quoteMint: NATIVE_MINT });
    } else {
      throw bad("for create, give the dev buy in SOL (denominatedInSol: true)");
    }
    ixs = await PUMP_SDK.createV2AndBuyV2Instructions({
      global, mint, name: meta.name, symbol: meta.symbol, uri: meta.uri, creator: p.user, user: p.user,
      amount: tokens, quoteAmount, mayhemMode: false, holderReward: p.holderReward, slippage: p.slippage,
    });
    quote.quoteIn = p.amount;
    quote.tokensOut = fromRaw(tokens, TOKEN_DECIMALS);
  } else {
    ixs = [await PUMP_SDK.createV2Instruction({ mint, name: meta.name, symbol: meta.symbol, uri: meta.uri, creator: p.user, user: p.user, mayhemMode: false, holderReward: p.holderReward })];
  }

  const built = await finish(connection, p, ixs, CU_LIMIT.create, mintKeypair, tables);
  return {
    ...built, action: "create", mint: mint.toBase58(), encoding: "base64", venue: "pump", quote,
    note: mintKeypair
      ? "The mint keypair was generated on the server, signed this transaction once, and was discarded; only its address is returned. Sign with your wallet (as creator and payer), then broadcast (POST /rpc sendTransaction)."
      : "You supplied the mint, so the transaction needs your wallet's signature and the mint keypair's before it can be broadcast.",
  };
}
