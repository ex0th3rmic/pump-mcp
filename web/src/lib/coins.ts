import type { CurveData } from "./types";

export const BASE58_MINT = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface CoinComparisonRow {
  mint: string;
  curve?: CurveData;
  error?: string;
}

export function parseMints(input: string): string[] {
  const mints = [...new Set(input.split(/[\s,]+/).map((mint) => mint.trim()).filter(Boolean))];
  if (!mints.length) throw new Error("Enter at least one mint address.");
  if (mints.length > 8) throw new Error("Compare up to eight mints at a time.");
  const invalid = mints.find((mint) => !BASE58_MINT.test(mint));
  if (invalid) throw new Error(`Invalid base58 mint: ${invalid}`);
  return mints;
}

export function curveQueryCode(mints: string[], buyAmount?: string, sellTokens?: string): string {
  const query: Record<string, number> = {};
  if (buyAmount?.trim()) {
    const value = Number(buyAmount);
    if (!Number.isFinite(value) || value <= 0) throw new Error("Buy quote amount must be a positive number.");
    query.buyAmount = value;
  }
  if (sellTokens?.trim()) {
    const value = Number(sellTokens);
    if (!Number.isFinite(value) || value <= 0) throw new Error("Sell quote amount must be a positive number.");
    query.sellTokens = value;
  }
  return `async () => {
  const mints = ${JSON.stringify(mints)};
  const query = ${JSON.stringify(query)};
  const results = await Promise.allSettled(mints.map((mint) =>
    codemode.request({ method: "GET", path: \`/curve/\${mint}\`, query })
  ));
  return results.map((result, index) => result.status === "fulfilled"
    ? { mint: mints[index], curve: result.value }
    : { mint: mints[index], error: String(result.reason?.message ?? result.reason) }
  ).sort((a, b) => (b.curve?.graduationProgress ?? -1) - (a.curve?.graduationProgress ?? -1));
}`;
}
