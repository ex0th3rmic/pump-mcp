import type { Showcase } from "./types";

/** pump.fun classic curve constants (Global.initial_* in whole tokens). */
const INITIAL_VIRTUAL_TOKENS = 1_073_000_000;
const TOKENS_SOLD_AT_GRADUATION = 793_100_000;
const DEFAULT_INITIAL_VIRTUAL_QUOTE = 30; // SOL

export interface CurvePlot {
  /** Normalized [0..1] price points along the curve from 0 quote in to graduation. */
  points: Array<{ x: number; y: number }>;
  /** Where the coin sits on that curve, [0..1] on both axes. */
  now: { x: number; y: number };
  /** Quote raised when the curve completes, in whole quote units. */
  quoteAtGraduation: number;
  progress: number;
}

/**
 * Constant-product bonding curve: price(x) = (vq0 + x)^2 / k with k = vq0 * vt0. The coin's current
 * position is derived from graduation progress (tokens sold), which holds for SOL, USDC and PUMP
 * quoted curves alike because everything is normalized.
 */
export function plotCurve(progress: number, initialVirtualQuote: string | number | null, samples = 64): CurvePlot {
  const p = Math.min(1, Math.max(0, Number(progress) || 0));
  const vqIn = Number(initialVirtualQuote);
  const vq0 = Number.isFinite(vqIn) && vqIn > 0 ? vqIn : DEFAULT_INITIAL_VIRTUAL_QUOTE;
  const k = vq0 * INITIAL_VIRTUAL_TOKENS;
  const vqEnd = k / (INITIAL_VIRTUAL_TOKENS - TOKENS_SOLD_AT_GRADUATION);
  const xGrad = vqEnd - vq0;
  const price = (x: number) => (vq0 + x) ** 2 / k;
  const pMax = price(xGrad);
  const points = Array.from({ length: samples + 1 }, (_, i) => {
    const x = (xGrad * i) / samples;
    return { x: i / samples, y: price(x) / pMax };
  });
  const sold = p * TOKENS_SOLD_AT_GRADUATION;
  const xNow = k / (INITIAL_VIRTUAL_TOKENS - sold) - vq0;
  return { points, now: { x: xNow / xGrad, y: price(xNow) / pMax }, quoteAtGraduation: xGrad, progress: p };
}

export function plotShowcase(s: Showcase | null): CurvePlot {
  if (!s) return plotCurve(0.71, DEFAULT_INITIAL_VIRTUAL_QUOTE);
  return plotCurve(s.graduationProgress, s.initialVirtualQuote);
}

/** 0.0000419 → "0.0000419", 41900 → "41.9k", 1234567 → "1.23M" */
export function fmtQuote(n: number | null, kind: "price" | "amount"): string {
  if (n === null || !Number.isFinite(n)) return "—";
  if (kind === "price") {
    if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
    // tiny prices: 3 significant digits, never exponent form (9.96e-8 → 0.0000000996)
    const decimals = Math.max(2, -Math.floor(Math.log10(n)) + 2);
    return n.toFixed(decimals).replace(/0+$/, "");
  }
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function shortMint(mint: string): string {
  return mint.length > 12 ? `${mint.slice(0, 4)}…${mint.slice(-4)}` : mint;
}
