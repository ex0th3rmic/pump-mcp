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

export type Cluster = "mainnet-beta" | "devnet";

/** Explorer pages for a mint. pump.fun only lists mainnet coins, so devnet gets Solscan alone. */
export function explorerLinks(mint: string, cluster: Cluster = "mainnet-beta"): Array<{ label: string; href: string }> {
  const suffix = cluster === "devnet" ? "?cluster=devnet" : "";
  const links = [{ label: "Solscan", href: `https://solscan.io/token/${mint}${suffix}` }];
  if (cluster !== "devnet") links.push({ label: "pump.fun", href: `https://pump.fun/coin/${mint}` });
  return links;
}

export function accountUrl(address: string, cluster: Cluster = "mainnet-beta"): string {
  return `https://solscan.io/account/${address}${cluster === "devnet" ? "?cluster=devnet" : ""}`;
}

/** Age of a chain read: "just now", "12s ago", "4m ago", "2h ago". */
export function fmtAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 5_000) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
}
