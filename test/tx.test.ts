import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { AddressLookupTableAccount, Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import { pumpLookupAddresses } from "../src/lookup";
import { buildTrade, TradeError } from "../src/tx";
import { cassette } from "./support/rpc-cassette";

// Mainnet state recorded 2026-10-25 (see test/support/rpc-cassette.ts).
const LIVE_MINT = "GPieo9s4rz6ungQnsqyiUrznqDypMgrNXmFSDM2vpump"; // SOL-quoted, on the curve
const GRADUATED_MINT = "GCN58WHB85WJ2kt3vwsmNUs8yhLTQNGcFguP77AKpump"; // graduated, trades on PumpSwap
const RAYDIUM_ERA_MINT = "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump"; // graduated before PumpSwap existed

const BUYER = "CttCkrcNtFfVsGSChFpYTJpYwkxJcyfigu91a7io6EzS";
const PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const PUMP_AMM = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";

const tape = cassette("tx-mainnet");
afterAll(() => tape.save());
const deps = { rpcUrl: "https://rpc.invalid", fetchImpl: tape.fetchImpl, lookupTables: [] as Array<string | AddressLookupTableAccount> };

// The operator's lookup table, as `bun run lookup-table` would create it, built in memory.
let table: AddressLookupTableAccount;
beforeAll(async () => {
  const connection = new Connection(deps.rpcUrl, { commitment: "confirmed", fetch: tape.fetchImpl as unknown as typeof fetch });
  const addresses = await pumpLookupAddresses(await new OnlinePumpSdk(connection).fetchGlobal());
  table = new AddressLookupTableAccount({
    key: Keypair.generate().publicKey,
    state: { deactivationSlot: BigInt("18446744073709551615"), lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, authority: undefined, addresses },
  });
});

function decode(b64: string) {
  const tx = VersionedTransaction.deserialize(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const keys = tx.message.staticAccountKeys.map((k) => k.toBase58());
  const programs = tx.message.compiledInstructions.map((ix) => keys[ix.programIdIndex]!);
  const signers = keys.slice(0, tx.message.header.numRequiredSignatures);
  const signed = tx.signatures.map((s) => s.some((b) => b !== 0));
  return { tx, keys, programs, signers, signed };
}

const buy = { publicKey: BUYER, action: "buy", mint: LIVE_MINT, amount: 0.05, denominatedInSol: true, slippage: 10, priorityFee: 0.0001 };

describe("buildTrade: buys and sells on the bonding curve", () => {
  test("a SOL-denominated buy is an unsigned v0 tx paid by the buyer, with a pump program instruction and a quote", async () => {
    const out = await buildTrade(buy, deps);
    const d = decode(out.transaction);
    expect(out.encoding).toBe("base64");
    expect(out.venue).toBe("pump");
    expect(d.keys[0]).toBe(BUYER);
    expect(d.signers).toEqual([BUYER]);
    expect(d.signed).toEqual([false]);
    expect(d.programs).toContain(PUMP);
    expect(d.programs).toContain(COMPUTE_BUDGET);
    expect(Number(out.quote.tokensOut)).toBeGreaterThan(0);
    expect(out.quote.quoteIn).toBe(0.05);
    expect(out.bytes).toBe(Uint8Array.from(atob(out.transaction), (c) => c.charCodeAt(0)).length);
    expect(out.bytes).toBeLessThanOrEqual(1232);
    expect(out.lookupTablesUsed).toEqual([]); // a curve buy fits inline
  });

  test("a token-denominated buy prices the tokens and caps the cost", async () => {
    const out = await buildTrade({ ...buy, amount: 100_000, denominatedInSol: false }, deps);
    expect(out.venue).toBe("pump");
    expect(out.quote.tokensOut).toBe("100000");
    expect(Number(out.quote.quoteIn)).toBeGreaterThan(0);
    expect(decode(out.transaction).programs).toContain(PUMP);
  });

  test("selling a percentage reads the holder's balance and quotes the payout", async () => {
    const out = await buildTrade({ ...buy, action: "sell", amount: "50%", denominatedInSol: false, publicKey: HOLDER }, deps);
    expect(out.venue).toBe("pump");
    expect(Number(out.quote.tokensIn)).toBeGreaterThan(0);
    expect(Number(out.quote.quoteOut)).toBeGreaterThan(0);
    expect(decode(out.transaction).signers).toEqual([HOLDER]);
  });
});

describe("buildTrade: graduated coins route to PumpSwap", () => {
  test("auto routes a buy on a graduated coin to the pump-amm program", async () => {
    const out = await buildTrade({ ...buy, mint: GRADUATED_MINT }, deps);
    expect(out.venue).toBe("pump-amm");
    expect(decode(out.transaction).programs).toContain(PUMP_AMM);
  });

  test("a coin that graduated before PumpSwap existed is NOT_FOUND with a clear reason", async () => {
    await expect(buildTrade({ ...buy, mint: RAYDIUM_ERA_MINT }, deps)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("pool=pump on a graduated coin is refused before building", async () => {
    await expect(buildTrade({ ...buy, mint: GRADUATED_MINT, pool: "pump" }, deps)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("buildTrade: create", () => {
  const create = {
    publicKey: BUYER,
    action: "create",
    amount: 0.1,
    denominatedInSol: true,
    slippage: 10,
    priorityFee: 0.0001,
    tokenMetadata: { name: "test coin", symbol: "TEST", uri: "https://ipfs.io/ipfs/bafkreigh2akiscaildc3nvjrf6dh7kbw4l3xzh6nb6p4xv5gm2vm6hqq4e" },
  };

  test("without a mint, the server makes one, signs with it, and returns a tx that needs only the creator", async () => {
    const out = await buildTrade(create, { ...deps, lookupTables: [table] });
    const d = decode(out.transaction);
    expect(out.venue).toBe("pump");
    expect(typeof out.mint).toBe("string");
    expect(d.signers).toEqual([BUYER, out.mint!]);
    expect(d.signed).toEqual([false, true]); // creator still to sign; mint already signed
    expect(d.programs).toContain(PUMP);
    expect(Number(out.quote.tokensOut)).toBeGreaterThan(0); // the dev buy
    expect(out.bytes).toBeLessThanOrEqual(1232);
    expect(out.lookupTablesUsed).toEqual([table.key.toBase58()]); // create + buy needs the table to fit
    expect(JSON.stringify(out)).not.toMatch(/secret/i);
  });

  test("a caller-supplied (vanity) mint is left for the caller to co-sign", async () => {
    const mint = Keypair.generate().publicKey.toBase58();
    const out = await buildTrade({ ...create, mint, amount: 0 }, deps);
    const d = decode(out.transaction);
    expect(out.mint).toBe(mint);
    expect(d.signers).toEqual([BUYER, mint]);
    expect(d.signed).toEqual([false, false]);
  });
});

describe("buildTrade: validation happens before any RPC call", () => {
  const noRpc = { rpcUrl: "https://rpc.invalid", fetchImpl: async () => { throw new Error("no RPC expected"); } };
  test.each([
    ["unknown action", { ...buy, action: "burn" }],
    ["missing publicKey", { ...buy, publicKey: undefined }],
    ["bad publicKey", { ...buy, publicKey: "not-a-key" }],
    ["bad mint", { ...buy, mint: "nope" }],
    ["negative amount", { ...buy, amount: -1 }],
    ["slippage out of range", { ...buy, slippage: 120 }],
    ["sell in SOL", { ...buy, action: "sell", denominatedInSol: true }],
    ["unsupported venue", { ...buy, pool: "raydium" }],
    ["create without metadata", { ...buy, action: "create", mint: undefined }],
  ])("%s is BAD_REQUEST", async (_name, body) => {
    await expect(buildTrade(body, noRpc)).rejects.toBeInstanceOf(TradeError);
    await expect(buildTrade(body, noRpc)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("create + dev buy without a lookup table explains what to configure", async () => {
    const create = { publicKey: BUYER, action: "create", amount: 0.1, denominatedInSol: true, slippage: 10, priorityFee: 0.0001, tokenMetadata: { name: "test coin", symbol: "TEST", uri: "https://ipfs.io/ipfs/bafkreigh2akiscaildc3nvjrf6dh7kbw4l3xzh6nb6p4xv5gm2vm6hqq4e" } };
    await expect(buildTrade(create, { ...deps, lookupTables: [] })).rejects.toThrow(/LOOKUP_TABLES.*amount 0/);
  });

  test("no RPC_URL is NOT_CONFIGURED", async () => {
    await expect(buildTrade(buy, { rpcUrl: undefined, fetchImpl: noRpc.fetchImpl })).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });

});

// Second-largest holder of LIVE_MINT at recording time (the largest is the curve itself).
const HOLDER = "HzMoEth5JPeeiFyfti8xgczGhap7MEwAGTuwavidnq91";
