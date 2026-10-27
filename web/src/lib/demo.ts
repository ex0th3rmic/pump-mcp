import { codeFor, examples } from "./examples";

const DEMO_IDS = ["mode", "rank", "roundtrip", "buy", "launch"];
export const demoExamples = examples.filter((example) => DEMO_IDS.includes(example.id));

const results: Record<string, unknown> = {
  mode: {
    sample: true,
    quote: "SOL",
    mayhem: false,
    graduated: false,
    price: 0.00000012,
    progress: 0.64,
    tradesOn: "pump",
  },
  rank: [
    { sample: true, mint: "DemoCoinA…", progress: 0.82, tokensFor0_3: "382910" },
    { sample: true, mint: "DemoCoinB…", progress: 0.64, tokensFor0_3: "128430" },
    { sample: true, mint: "DemoCoinC…", progress: 0.31, tokensFor0_3: "99120" },
  ],
  roundtrip: {
    sample: true,
    in: 1,
    tokens: 1284300,
    back: 0.9721,
    roundTripCost: 0.0279,
    costPct: 2.79,
  },
  buy: {
    sample: true,
    venue: "pump",
    tokensOut: "128430",
    signers: ["<YOUR_WALLET>"],
    bytes: 775,
    note: "Sample preview only. No transaction was built.",
  },
  launch: {
    sample: true,
    mint: "DemoMint…",
    devBuyTokens: "250000",
    stillToSign: ["<YOUR_WALLET>"],
    note: "Sample launch only. Nothing was pinned, signed, or submitted.",
  },
};

export function demoResultFor(code: string): unknown {
  const example = demoExamples.find((item) => codeFor(item, null) === code);
  return results[example?.id ?? ""] ?? { sample: true, message: "Choose a curated example to see its sample result." };
}
