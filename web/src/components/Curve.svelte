<script lang="ts">
  import { fmtQuote, plotShowcase, shortMint } from "../lib/curve";
  import type { Showcase } from "../lib/types";

  let { showcase, state }: { showcase: Showcase | null; state: "loading" | "live" | "sample" } = $props();

  const W = 440;
  const H = 140;
  const PAD = 8;

  const plot = $derived(plotShowcase(showcase));
  const toX = (x: number) => PAD + x * (W - 2 * PAD);
  const toY = (y: number) => H - PAD - y * (H - 2 * PAD);
  const line = $derived(plot.points.map((p, i) => `${i ? "L" : "M"}${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)}`).join(" "));
  const area = $derived(`${line} L${toX(1).toFixed(1)},${H} L${toX(0).toFixed(1)},${H} Z`);
  const dot = $derived({ cx: toX(plot.now.x), cy: toY(plot.now.y) });
  const pct = $derived(Math.round(plot.progress * 100));
  const sym = $derived(showcase?.quote.symbol ?? "SOL");
  const label = $derived(
    state === "loading" ? "bonding curve · loading" : state === "live" ? `bonding curve · ${shortMint(showcase!.mint)}` : "bonding curve · sample",
  );
  const headline = $derived(showcase?.complete ? "graduated" : `${pct}% to graduation`);
</script>

<div class="curve" class:loading={state === "loading"} aria-label="Bonding curve chart">
  <div class="ch">
    <span>{label}</span>
    <b>{headline}</b>
  </div>
  <svg viewBox="0 0 {W} {H}" preserveAspectRatio="none" role="img" aria-hidden="true">
    {#each [0.25, 0.5, 0.75] as g}
      <line class="ax" x1="0" y1={toY(g)} x2={W} y2={toY(g)} />
    {/each}
    <path class="fill" d={area} />
    <path class="path" d={line} />
    <circle class="dot" cx={dot.cx} cy={dot.cy} r="4.5" />
  </svg>
  <div class="grad" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100">
    <i style:width="{pct}%"></i>
  </div>
  <div class="gl">
    <span>0 {sym}</span>
    <span>
      {#if showcase?.complete}
        trades on PumpSwap now
      {:else if showcase}
        {fmtQuote(showcase.priceInQuote, "price")} {sym} · mcap {fmtQuote(showcase.marketCapInQuote, "amount")}
      {:else if state === "loading"}
        reading the chain…
      {:else}
        set SHOWCASE_MINT to show a live coin
      {/if}
    </span>
    <span>{Math.round(plot.quoteAtGraduation)} {sym}</span>
  </div>
</div>

<style>
  .curve {
    background: var(--s1);
    border: 1px solid var(--b);
    border-radius: 8px;
    padding: 14px 16px 12px;
    transition: opacity 0.3s;
  }
  .curve.loading { opacity: 0.6; }
  .ch {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--t3);
    margin-bottom: 8px;
  }
  .ch b { color: var(--t); font-weight: 600; white-space: nowrap; }
  svg { width: 100%; height: 140px; display: block; }
  .ax { stroke: var(--b); stroke-width: 1; }
  .path {
    fill: none;
    stroke: var(--ac);
    stroke-width: 2;
    stroke-dasharray: 700;
    stroke-dashoffset: 700;
    animation: draw 1.8s ease-out forwards;
  }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  .fill { fill: var(--ac); opacity: 0; animation: fadein 0.8s 1.2s forwards; }
  @keyframes fadein { to { opacity: 0.08; } }
  .dot {
    fill: var(--bg);
    stroke: var(--ac);
    stroke-width: 2;
    opacity: 0;
    animation: pop 0.4s 1.6s forwards;
  }
  @keyframes pop { to { opacity: 1; } }
  .grad { height: 4px; border-radius: 2px; background: var(--b); margin-top: 10px; overflow: hidden; }
  .grad i { display: block; height: 100%; background: var(--ac); transition: width 1.8s ease-out; }
  .gl {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--t3);
    margin-top: 8px;
  }
  .gl span:nth-child(2) { text-align: center; color: var(--t2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (prefers-reduced-motion: reduce) {
    .path { stroke-dashoffset: 0; }
    .fill { opacity: 0.08; }
    .dot { opacity: 1; }
  }
</style>
