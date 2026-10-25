import { describe, expect, test } from "bun:test";
import { bondingCurveAddress, decodeBondingCurve, describeCurve, findProgramAddress, isBase58Pubkey, PUMP_PROGRAM_ID, quoteBuy, quoteSell, type BondingCurve } from "../src/curve";

// Mainnet fixture captured 2026-10-24: bonding curve of 9BB6...pump (graduated), owner = pump program.
const GRADUATED_MINT = "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump";
const GRADUATED_CURVE = "TBHe5tJnuT4CQbHorJ1uVdfUoaYGPKgfCpiv2jgesVN";
const GRADUATED_DATA =
  "F7f4N2DYrGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACAxqR+jQMAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** A freshly created curve: Global initial reserves from pump-public-docs. */
const fresh: BondingCurve = {
  virtualTokenReserves: 1_073_000_000_000_000n,
  virtualQuoteReserves: 30_000_000_000n,
  realTokenReserves: 793_100_000_000_000n,
  realQuoteReserves: 0n,
  tokenTotalSupply: 1_000_000_000_000_000n,
  complete: false,
  creator: "CttCkrcNtFfVsGSChFpYTJpYwkxJcyfigu91a7io6EzS",
  isMayhemMode: false,
  isCashbackCoin: false,
  quoteMint: null,
  creatorFeeBps: 30n,
  isHolderReward: true,
  creatorFee: 0n,
  protocolFees: 0n,
  depth: 0,
  initialVirtualQuoteReserves: 30_000_000_000n,
  postCompleteBaseOut: 0n,
  postCompleteQuoteIn: 0n,
};

describe("PDA derivation", () => {
  test("bonding-curve PDA matches the on-chain account for a real mint", () => {
    expect(bondingCurveAddress(GRADUATED_MINT)).toBe(GRADUATED_CURVE);
  });
  test("matches bondingCurveKey reported by PumpPortal for freshly created coins", () => {
    const pairs: Array<[string, string]> = [
      ["7UoqV2P8MJmjPaQTBkEZjdjkMsATJPtxHtNcCUGQpump", "BF39Uu9TipUbEKSMKGVKZs5VaTxVzaV6btTm3bJ9ueGV"],
      ["3ma5EFQEnNHGeLMXsxTeGS9kN8zkAQXtDUeFiUcLAVwb", "EVaTuks3Cj9RsCVUhjGEzqKjkefZDvqwS83Y6A6u3zAP"],
      ["2R3ysppwYuw6xhZdZjQqFWjvzk4MS5fg7F4RLxtBpump", "CgjLcPTCw6erLCTWPVbGC3Tg88MaPAP6yxVqQwk4HF13"],
    ];
    for (const [mint, curve] of pairs) expect(bondingCurveAddress(mint)).toBe(curve);
  });
  test("findProgramAddress returns an off-curve address with a bump", () => {
    const { address, bump } = findProgramAddress([new TextEncoder().encode("global")], PUMP_PROGRAM_ID);
    expect(address).toBe("4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf"); // pump Global account
    expect(bump).toBeGreaterThanOrEqual(0);
  });
  test("isBase58Pubkey", () => {
    expect(isBase58Pubkey(GRADUATED_MINT)).toBe(true);
    expect(isBase58Pubkey("0OIl")).toBe(false);
    expect(isBase58Pubkey("1".repeat(50))).toBe(false);
  });
});

describe("decode", () => {
  test("decodes a real graduated curve account", () => {
    const c = decodeBondingCurve(b64(GRADUATED_DATA));
    expect(c.complete).toBe(true);
    expect(c.tokenTotalSupply).toBe(1_000_000_000_000_000n);
    expect(c.virtualQuoteReserves).toBe(0n);
    expect(c.depth).toBe(0);
    expect(c.creator).toBeNull();
    const d = describeCurve(GRADUATED_MINT, GRADUATED_CURVE, c, { buyAmount: 1 });
    expect(d.tradesOn).toBe("pump-amm");
    expect(d.priceInQuote).toBeNull();
    expect(d.graduationProgress).toBe(1);
    expect(d.buyQuote).toBeUndefined();
  });
  test("rejects short accounts", () => {
    expect(() => decodeBondingCurve(new Uint8Array(20))).toThrow(/too short/);
  });
  test("decodes a minimal (pre-upgrade) account with defaults", () => {
    const buf = new Uint8Array(8 + 40 + 1);
    const view = new DataView(buf.buffer);
    view.setBigUint64(8, 5n, true);
    view.setBigUint64(16, 7n, true);
    buf[48] = 1;
    const c = decodeBondingCurve(buf);
    expect(c.virtualTokenReserves).toBe(5n);
    expect(c.virtualQuoteReserves).toBe(7n);
    expect(c.complete).toBe(true);
    expect(c.creator).toBeNull();
    expect(c.creatorFeeBps).toBe(0n);
    expect(c.isHolderReward).toBe(false);
  });
});

describe("quotes", () => {
  test("USDC-quoted (Mayhem) curves report prices in USDC with 6 decimals", () => {
    const usdc: BondingCurve = { ...fresh, quoteMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", isMayhemMode: true, virtualQuoteReserves: 404_016_399n };
    const d = describeCurve("mint", "curve", usdc, { buyAmount: 10 }) as Record<string, any>;
    expect(d.quote).toEqual({ mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC", decimals: 6 });
    expect(d.reserves.virtualQuote).toBe("404.016399");
    expect(d.priceInQuote).toBeCloseTo(404.016399 / 1_073_000_000, 15);
    expect(d.buyQuote).toBeUndefined(); // mayhem: virtual params are program-adjusted
    const plain = describeCurve("mint", "curve", { ...usdc, isMayhemMode: false }, { buyAmount: 10 }) as Record<string, any>;
    expect(plain.buyQuote.usdcIn).toBe(10);
    expect(plain.buyQuote.fee).toBe("0.100000");
  });
  test("decodes every IDL field from a full-length account", () => {
    // 8 disc + 5*u64 + bool + pubkey + bool + bool + pubkey + u64 + bool + bool + u64 + u64 + u8 + u64 + u64 + u64
    const buf = new Uint8Array(8 + 40 + 1 + 32 + 2 + 32 + 8 + 2 + 8 + 8 + 1 + 8 + 8 + 8);
    const v = new DataView(buf.buffer);
    let o = 8;
    for (const n of [1n, 2n, 3n, 4n, 5n]) { v.setBigUint64(o, n, true); o += 8; }
    buf[o++] = 0; // complete
    buf.fill(9, o, o + 32); o += 32; // creator
    buf[o++] = 1; // mayhem
    buf[o++] = 0; // cashback
    o += 32; // quote mint = zero => SOL
    v.setBigUint64(o, 50n, true); o += 8; // creator_fee_bps
    buf[o++] = 0; // can_edit_creator_fee
    buf[o++] = 1; // is_holder_reward
    v.setBigUint64(o, 11n, true); o += 8; // creator_fee
    v.setBigUint64(o, 22n, true); o += 8; // protocol_fees
    buf[o++] = 3; // depth
    v.setBigUint64(o, 30_000_000_000n, true); o += 8; // initial_virtual_quote_reserves
    v.setBigUint64(o, 44n, true); o += 8;
    v.setBigUint64(o, 55n, true); o += 8;
    const c = decodeBondingCurve(buf);
    expect(c.virtualTokenReserves).toBe(1n);
    expect(c.tokenTotalSupply).toBe(5n);
    expect(c.creator).not.toBeNull();
    expect(c.isMayhemMode).toBe(true);
    expect(c.quoteMint).toBeNull();
    expect(c.creatorFeeBps).toBe(50n);
    expect(c.isHolderReward).toBe(true);
    expect(c.creatorFee).toBe(11n);
    expect(c.protocolFees).toBe(22n);
    expect(c.depth).toBe(3);
    expect(c.initialVirtualQuoteReserves).toBe(30_000_000_000n);
    expect(c.postCompleteBaseOut).toBe(44n);
    expect(c.postCompleteQuoteIn).toBe(55n);
  });
  test("PUMP-quoted curves are priced in PUMP", () => {
    const d = describeCurve("m", "c", { ...fresh, quoteMint: "pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn", virtualQuoteReserves: 781_553_314_819n }) as Record<string, any>;
    expect(d.quote.symbol).toBe("PUMP");
    expect(d.reserves.virtualQuote).toBe("781553.314819");
  });
  test("unknown quote mints get raw units only", () => {
    const odd: BondingCurve = { ...fresh, quoteMint: "So11111111111111111111111111111111111111112" };
    const d = describeCurve("mint", "curve", odd, { buyAmount: 1 }) as Record<string, any>;
    expect(d.quote.decimals).toBeNull();
    expect(d.priceInQuote).toBeNull();
    expect(d.reserves.virtualQuote).toBeNull();
    expect(d.reserves.virtualQuoteRaw).toBe("30000000000");
    expect(d.buyQuote).toBeUndefined();
  });
  test("1 SOL into a fresh curve buys ~34.3M tokens after the 1% fee", () => {
    const { tokensOut, feeRaw } = quoteBuy(fresh, 1_000_000_000n);
    expect(feeRaw).toBe(10_000_000n);
    const whole = Number(tokensOut) / 1e6;
    expect(whole).toBeGreaterThan(34_000_000);
    expect(whole).toBeLessThan(34_500_000);
  });
  test("buy is capped at real token reserves", () => {
    const { tokensOut } = quoteBuy(fresh, 10_000_000_000_000n);
    expect(tokensOut).toBe(fresh.realTokenReserves);
  });
  test("selling what you just bought returns slightly less than paid", () => {
    const { tokensOut } = quoteBuy(fresh, 1_000_000_000n);
    const after: BondingCurve = {
      ...fresh,
      virtualQuoteReserves: fresh.virtualQuoteReserves + 990_000_000n,
      virtualTokenReserves: fresh.virtualTokenReserves - tokensOut,
    };
    const { quoteOut } = quoteSell(after, tokensOut);
    expect(quoteOut).toBeLessThan(1_000_000_000n);
    expect(quoteOut).toBeGreaterThan(960_000_000n);
  });
  test("describeCurve reports price, mcap, progress and both quotes for a live curve", () => {
    const d = describeCurve("mint", "curve", fresh, { buyAmount: 1, sellTokens: 1000 }) as Record<string, any>;
    expect(d.tradesOn).toBe("pump");
    expect(d.quote).toEqual({ mint: null, symbol: "SOL", decimals: 9 });
    expect(d.priceInQuote).toBeCloseTo(30 / 1_073_000_000, 12);
    expect(d.marketCapInQuote).toBeCloseTo((30 / 1_073_000_000) * 1_000_000_000, 6);
    expect(d.graduationProgress).toBe(0);
    expect(d.reserves.virtualQuote).toBe("30.000000000");
    expect(d.buyQuote.solIn).toBe(1);
    expect(d.buyQuote.fee).toBe("0.010000000");
    expect(d.sellQuote.quoteOutRaw).toMatch(/^\d+$/);
    expect(d.creatorFeeBps).toBe(30);
    expect(d.isHolderReward).toBe(true);
  });
});
