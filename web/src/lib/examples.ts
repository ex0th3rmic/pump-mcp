export type Group = "intel" | "social" | "trading";

export interface Example {
  id: string;
  group: Group;
  /** The question a person would ask their agent. */
  q: string;
  /** What happens, in one or two sentences. */
  a: string;
  routes: string[];
  /** Runs several requests inside one execute call. */
  oneCall?: boolean;
  /** Needs the operator's PUMP_API_KEY. */
  needsKey?: boolean;
  /** Spans the full grid width. */
  wide?: boolean;
  /** Execute body. `__MINT__` is replaced with the showcase mint when the page knows one. */
  code: string;
}

export const groups: Array<{ id: Group; title: string; note: string; link?: { href: string; text: string } }> = [
  { id: "intel", title: "intel", note: "straight from the chain, no key" },
  { id: "social", title: "social", note: "official pump.fun Developer API, once the operator's key is approved at", link: { href: "https://developers.pump.fun", text: "developers.pump.fun" } },
  { id: "trading", title: "trading", note: "quotes and unsigned transactions, one call" },
];

export const examples: Example[] = [
  {
    id: "holders",
    group: "intel",
    q: "Who are the top 20 holders, and what share does the biggest hold?",
    a: "Largest token accounts plus supply, concentration computed in code. Flags a whale-heavy coin before you buy.",
    routes: ["POST /rpc getTokenLargestAccounts", "getTokenSupply"],
    oneCall: true,
    code: `async () => {
  const mint = "__MINT__";
  const [largest, supply] = await Promise.all([
    codemode.request({ method: "POST", path: "/rpc", body: { method: "getTokenLargestAccounts", params: [mint] } }),
    codemode.request({ method: "POST", path: "/rpc", body: { method: "getTokenSupply", params: [mint] } }),
  ]);
  const total = Number(supply.value.amount);
  const top = largest.value.slice(0, 20).map((a) => ({ account: a.address, share: +(Number(a.amount) / total).toFixed(4) }));
  return { holders: top.length, biggestShare: top[0]?.share, top10Share: +top.slice(0, 10).reduce((s, h) => s + h.share, 0).toFixed(4), top };
}`,
  },
  {
    id: "creator",
    group: "intel",
    q: "What has the creator wallet done in its last 50 transactions?",
    a: "Signature history and transaction detail for any wallet. Spot a dev who sells into every pump.",
    routes: ["POST /rpc getSignaturesForAddress", "getTransaction"],
    oneCall: true,
    code: `async () => {
  const mint = "__MINT__";
  const curve = await codemode.request({ method: "GET", path: \`/curve/\${mint}\` });
  const sigs = await codemode.request({ method: "POST", path: "/rpc", body: { method: "getSignaturesForAddress", params: [curve.creator, { limit: 50 }] } });
  const failed = sigs.filter((s) => s.err).length;
  return {
    creator: curve.creator,
    txCount: sigs.length,
    failed,
    newest: sigs[0] && new Date(sigs[0].blockTime * 1000).toISOString(),
    oldest: sigs.at(-1) && new Date(sigs.at(-1).blockTime * 1000).toISOString(),
    signatures: sigs.slice(0, 10).map((s) => s.signature),
  };
}`,
  },
  {
    id: "mode",
    group: "intel",
    q: "Is this coin in Mayhem mode, or quoted in USDC?",
    a: "The curve decode reports the quote asset and mode. SOL, USDC and PUMP curves all read correctly.",
    routes: ["GET /curve/{mint}"],
    code: `async () => {
  const c = await codemode.request({ method: "GET", path: "/curve/__MINT__" });
  return { quote: c.quote.symbol, mayhem: c.isMayhemMode, holderReward: c.isHolderReward, price: c.priceInQuote, marketCap: c.marketCapInQuote, graduated: c.complete, note: c.note };
}`,
  },
  {
    id: "watch",
    group: "intel",
    q: "Watch this mint and tell me the moment it crosses 90%.",
    a: "The agent loops the curve read on its own schedule. Each check is one cheap call.",
    routes: ["GET /curve/{mint} → graduationProgress"],
    code: `async () => {
  const c = await codemode.request({ method: "GET", path: "/curve/__MINT__" });
  const target = 0.9;
  return { progress: c.graduationProgress, crossed: c.graduationProgress >= target, remaining: +(target - c.graduationProgress).toFixed(4), tradesOn: c.tradesOn };
}`,
  },
  {
    id: "top-traders",
    group: "social",
    q: "Which top-50 PnL traders have traded this coin recently?",
    a: "One official route already joins the leaderboard with a coin's trades. Filter and summarize in code.",
    routes: ["GET /pnl-leaderboard/top-trader-trades/{mint}"],
    needsKey: true,
    code: `async () => {
  // Official pump.fun Developer API: needs the operator's PUMP_API_KEY.
  const trades = await codemode.request({ method: "GET", path: "/pnl-leaderboard/top-trader-trades/__MINT__" });
  const list = Array.isArray(trades) ? trades : trades.items ?? trades.trades ?? [];
  return { count: list.length, sample: list.slice(0, 10) };
}`,
  },
  {
    id: "replies",
    group: "social",
    q: "Summarize the last 30 replies on this coin. Any callouts?",
    a: "Replies and top callouts from the official API, trimmed before they reach the model.",
    routes: ["GET /replies/{mint}", "GET /callout/coin/{coin}"],
    needsKey: true,
    oneCall: true,
    code: `async () => {
  // Official pump.fun Developer API: needs the operator's PUMP_API_KEY.
  const mint = "__MINT__";
  const [replies, callouts] = await Promise.all([
    codemode.request({ method: "GET", path: \`/replies/\${mint}\`, query: { limit: 30 } }),
    codemode.request({ method: "GET", path: \`/callout/coin/\${mint}\` }),
  ]);
  const r = Array.isArray(replies) ? replies : replies.items ?? replies.replies ?? [];
  return { replies: r.slice(0, 30).map((x) => x.text ?? x.content ?? x), callouts: Array.isArray(callouts) ? callouts.slice(0, 5) : callouts };
}`,
  },
  {
    id: "rank",
    group: "trading",
    q: "Check these 8 coins. Which is closest to graduating, and what does 0.3 SOL buy on each?",
    a: "Eight curve reads and eight quotes run in parallel inside one execute. The agent gets a ranked table, not eight tool calls.",
    routes: ["Promise.all → GET /curve/{mint}?buyAmount=0.3 × 8"],
    oneCall: true,
    wide: true,
    code: `async () => {
  // Put up to 8 mints here. One call, all in parallel.
  const mints = ["__MINT__"];
  const curves = await Promise.all(mints.map((m) => codemode.request({ method: "GET", path: \`/curve/\${m}\`, query: { buyAmount: 0.3 } })));
  return curves
    .map((c, i) => ({ mint: mints[i], progress: c.graduationProgress, graduated: c.complete, price: c.priceInQuote, tokensFor0_3: c.buyQuote?.tokensOut ?? null }))
    .sort((a, b) => b.progress - a.progress);
}`,
  },
  {
    id: "roundtrip",
    group: "trading",
    q: "What's the round-trip cost if I buy 1 SOL and sell straight back?",
    a: "Buy quote, then sell quote on the same curve state. The real spread plus fees before you commit.",
    routes: ["GET /curve/{mint}?buyAmount=1", "?sellTokens=…"],
    oneCall: true,
    code: `async () => {
  const mint = "__MINT__";
  const buy = await codemode.request({ method: "GET", path: \`/curve/\${mint}\`, query: { buyAmount: 1 } });
  if (!buy.buyQuote) return { note: buy.note };
  const tokens = Number(buy.buyQuote.tokensOut);
  const sell = await codemode.request({ method: "GET", path: \`/curve/\${mint}\`, query: { sellTokens: tokens } });
  const sym = buy.quote.symbol.toLowerCase();
  const back = sell.sellQuote[\`\${sym}Out\`];
  return { in: 1, tokens, back, roundTripCost: +(1 - back).toFixed(6), costPct: +((1 - back) * 100).toFixed(2), fees: { buy: buy.buyQuote.fee, sell: sell.sellQuote.fee } };
}`,
  },
  {
    id: "impact",
    group: "trading",
    q: "How much does the price move if I buy 0.5 SOL versus 2 SOL?",
    a: "Two quotes on the same curve state, price impact computed in code. Size the entry before you place it.",
    routes: ["GET /curve/{mint}?buyAmount=0.5", "?buyAmount=2"],
    oneCall: true,
    code: `async () => {
  const mint = "__MINT__";
  const [small, big] = await Promise.all([0.5, 2].map((buyAmount) => codemode.request({ method: "GET", path: \`/curve/\${mint}\`, query: { buyAmount } })));
  if (!small.buyQuote) return { note: small.note };
  const eff = (q, amount) => amount / Number(q.buyQuote.tokensOut); // average price paid per token
  const spot = small.priceInQuote;
  return {
    spot,
    at0_5: { avgPrice: eff(small, 0.5), impactPct: +((eff(small, 0.5) / spot - 1) * 100).toFixed(2) },
    at2: { avgPrice: eff(big, 2), impactPct: +((eff(big, 2) / spot - 1) * 100).toFixed(2) },
  };
}`,
  },
  {
    id: "buy",
    group: "trading",
    q: "Build a 0.25 SOL buy for my wallet, 10% slippage. I'll sign it.",
    a: "Returns an unsigned transaction for your wallet. Nothing moves until you sign it. PumpPortal takes 0.5%.",
    routes: ["POST /trade/local"],
    code: `async () => {
  const mint = "__MINT__";
  const wallet = "<YOUR_WALLET_PUBLIC_KEY>";
  const tx = await codemode.request({
    method: "POST",
    path: "/trade/local",
    body: { publicKey: wallet, action: "buy", mint, amount: 0.25, denominatedInSol: true, slippage: 10, priorityFee: 0.0005, pool: "auto" },
  });
  // tx.bytes is a base64 VersionedTransaction. Sign it with your wallet, then send it via POST /rpc sendTransaction.
  return { encoding: tx.encoding, bytes: tx.bytes?.slice(0, 80) + "…", length: tx.bytes?.length };
}`,
  },
];

export const DEFAULT_MINT = "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump";

export function codeFor(ex: Example, mint: string | null): string {
  return ex.code.replaceAll("__MINT__", mint ?? DEFAULT_MINT);
}
