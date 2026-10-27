<script lang="ts">
  import Curve from "../Curve.svelte";
  import { activity } from "../../lib/activity.svelte";
  import { accountUrl, curveQueryCode, explorerLinks, fmtAge, parseMints, type CoinComparisonRow } from "../../lib/coins";
  import { fmtQuote, plotCurve, shortMint } from "../../lib/curve";
  import { mcp } from "../../lib/mcp";
  import { navigate } from "../../lib/router.svelte";
  import { session } from "../../lib/session.svelte";
  import type { CurveData } from "../../lib/types";

  let mints = $state(session.selectedMint);
  let buyAmount = $state(session.token ? "0.1" : "0.5");
  let sellTokens = $state("");
  let rows = $state<CoinComparisonRow[]>([]);
  let running = $state(false);
  let error = $state("");
  let loaded = $state(false);
  let demoLoaded = $state(false);
  let readAt = $state<number | null>(null);
  let now = $state(Date.now());
  let copied = $state(false);
  const demo = $derived(!session.token);
  const cluster = $derived(session.health?.cluster ?? "mainnet-beta");
  const quoteSymbol = $derived(rows[0]?.curve?.quote.symbol ?? "SOL");
  const SHOWCASE_REFRESH_MS = 20_000; // matches the Worker's edge cache, so faster polling would only re-read the cache

  // A 1s clock for the "updated 12s ago" label, and a background refresh of the public showcase while the tab is
  // visible. Background refreshes skip the activity log and the busy state so they never flicker or spam the log.
  $effect(() => {
    const clock = setInterval(() => (now = Date.now()), 1_000);
    const poll = demo
      ? setInterval(() => { if (document.visibilityState === "visible" && !running) void readShowcase(false); }, SHOWCASE_REFRESH_MS)
      : undefined;
    return () => { clearInterval(clock); if (poll) clearInterval(poll); };
  });

  $effect(() => {
    if (!demo && !loaded && !mints) {
      loaded = true;
      fetch("/api/showcase", { cache: "no-store" })
        .then((response) => response.ok ? response.json() as Promise<{ mint: string }> : null)
        .then((showcase) => { if (showcase && !mints) mints = showcase.mint; })
        .catch(() => {});
    }
    if (demo && !demoLoaded) {
      demoLoaded = true;
      void inspect();
    }
  });

  async function readShowcase(manual: boolean) {
    if (manual) { running = true; error = ""; }
    const started = Date.now();
    const event = manual ? activity.start("Read public showcase") : null;
    try {
      const response = await fetch("/api/showcase", { cache: "no-store" });
      if (!response.ok) throw new Error(`Public showcase returned ${response.status}`);
      const curve = await response.json() as CurveData;
      mints = curve.mint;
      buyAmount = "0.5";
      rows = [{ mint: curve.mint, curve }];
      const asOf = curve.asOf ? Date.parse(curve.asOf) : Number.NaN;
      readAt = Number.isFinite(asOf) ? asOf : Date.now();
      error = "";
      if (event) activity.finish(event, "success", Date.now() - started, { mint: curve.mint });
    } catch (cause) {
      // A failed background refresh keeps the last good data on screen; only manual reads surface the error.
      if (manual) error = cause instanceof Error ? cause.message : String(cause);
      if (event) activity.finish(event, "error", Date.now() - started);
    } finally {
      if (manual) running = false;
    }
  }

  async function copyMint(mint: string) {
    try {
      await navigator.clipboard.writeText(mint);
      copied = true;
      setTimeout(() => (copied = false), 1_500);
    } catch {
      // Clipboard can be blocked; the address stays selectable on the page.
    }
  }

  function openUnlock() {
    session.unlockOpen = true;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function inspect() {
    error = "";
    if (demo) return readShowcase(true);
    let parsed: string[];
    let code: string;
    try {
      parsed = parseMints(mints);
      code = curveQueryCode(parsed, buyAmount, sellTokens);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      return;
    }
    running = true;
    const started = Date.now();
    const event = activity.start(parsed.length === 1 ? "Read bonding curve" : `Compare ${parsed.length} coins`, parsed[0]);
    try {
      const result = await mcp.execute<CoinComparisonRow[]>(session.token, code);
      if (result.isError || !Array.isArray(result.data)) throw new Error(result.text || "The curve query returned no structured data.");
      rows = result.data;
      readAt = Date.now();
      activity.finish(event, "success", Date.now() - started);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      activity.finish(event, "error", Date.now() - started);
    } finally {
      running = false;
    }
  }

  function trade(mint: string) {
    session.selectedMint = mint;
    navigate("/app/trade");
  }
</script>

<section class="search-panel">
  <div class="section-head">
    <div><span class="kicker">on-chain intelligence</span><h2>{demo ? "Explore the live showcase." : "Inspect a bonding curve."}</h2></div>
    {#if readAt}
      <span class="freshness" title={new Date(readAt).toLocaleString()}><i class:stale={now - readAt > 90_000}></i>{demo ? "live" : "read"} · {fmtAge(now - readAt)}</span>
    {:else}
      <span class="source">{demo ? "public showcase" : "Solana RPC · live chain state"}</span>
    {/if}
  </div>
  {#if demo}
    <div class="demo-strip">
      <p>One pump.fun coin, read straight from Solana and refreshed every 20 seconds while this tab is open. No token needed.</p>
      <div class="strip-actions">
        <button class="ghost" onclick={() => void inspect()} disabled={running || session.health?.rpc === false}>{running ? "Reading chain…" : "Refresh now"}</button>
        <button class="text-button" onclick={openUnlock}>Search any coin →</button>
      </div>
    </div>
  {:else}
    <p class="intro">Paste one mint for a full curve view, or up to eight to compare graduation progress and quotes in one execute call.</p>
    <form onsubmit={(event) => { event.preventDefault(); void inspect(); }}>
      <label for="mints">Mint addresses <span>comma, space, or newline separated</span></label>
      <textarea id="mints" bind:value={mints} rows="3" spellcheck="false" placeholder="9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump"></textarea>
      <div class="query-row">
        <label>Buy quote <span class="input"><input bind:value={buyAmount} inputmode="decimal" aria-label="Buy quote amount" /><i>{quoteSymbol}</i></span></label>
        <label>Sell quote <span class="input"><input bind:value={sellTokens} inputmode="decimal" aria-label="Sell quote token amount" placeholder="optional" /><i>tokens</i></span></label>
        <button class="primary" type="submit" disabled={running || session.health?.rpc === false}>{running ? "Reading chain…" : rows.length ? "Refresh curves" : "Read curves"}</button>
      </div>
    </form>
  {/if}
  {#if session.health?.rpc === false}<p class="notice">Set RPC_URL on the Worker to enable curve reads.</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

{#if rows.length === 1 && rows[0]?.curve}
  {@const coin = rows[0].curve}
  {@const target = plotCurve(coin.graduationProgress, coin.initialVirtualQuote).quoteAtGraduation}
  {@const raised = Number(coin.reserves?.realQuote)}
  {@const quoteIn = coin.buyQuote?.quoteIn ?? coin.buyQuote?.solIn}
  {@const r = coin.reserves}
  {@const curveAccount = coin.bondingCurve ?? coin.curve}
  <div class="single-grid">
    <section class="panel chart-panel">
      <Curve showcase={coin} state="live" />
      <div class="coin-address">
        <span title={coin.mint}>{coin.mint}</span>
        <span class="links">
          <button onclick={() => void copyMint(coin.mint)} aria-live="polite">{copied ? "copied ✓" : "copy mint"}</button>
          {#each explorerLinks(coin.mint, cluster) as link}<a href={link.href} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>{/each}
        </span>
      </div>
      <div class="facts" aria-label="Curve reserves">
        {#if !coin.complete && r?.realTokens != null}
          <div><span>Tokens left on curve</span><b>{fmtQuote(Number(r.realTokens), "amount")}</b></div>
        {/if}
        {#if r?.virtualQuote != null && r?.virtualTokens != null}
          <div><span>Virtual reserves</span><b>{fmtQuote(Number(r.virtualQuote), "amount")} {coin.quote.symbol} · {fmtQuote(Number(r.virtualTokens), "amount")}</b></div>
        {/if}
        {#if r?.totalSupply != null}
          <div><span>Total supply</span><b>{fmtQuote(Number(r.totalSupply), "amount")}</b></div>
        {/if}
        {#if coin.creatorFeeBps != null}
          <div><span>Creator fee</span><b>{(coin.creatorFeeBps / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%</b></div>
        {/if}
        {#if curveAccount && curveAccount.length > 30}
          <div><span>Curve account</span><b><a href={accountUrl(curveAccount, cluster)} target="_blank" rel="noopener noreferrer" title={curveAccount}>{shortMint(curveAccount)} ↗</a></b></div>
        {/if}
      </div>
    </section>
    <section class="panel stats-panel">
      <div class="panel-title"><span>curve state</span><b class:graduated={coin.complete}>{coin.complete ? "Graduated" : "Active"}</b></div>
      <dl>
        <div><dt>Price</dt><dd>{fmtQuote(coin.priceInQuote, "price")} {coin.quote.symbol}</dd></div>
        <div><dt>Market cap</dt><dd>{fmtQuote(coin.marketCapInQuote, "amount")} {coin.quote.symbol}</dd></div>
        {#if !coin.complete && Number.isFinite(raised)}
          <div><dt>Raised</dt><dd>{fmtQuote(raised, "amount")} <span class="of">/ {Math.round(target)} {coin.quote.symbol}</span></dd></div>
        {/if}
        <div><dt>Graduation</dt><dd>{coin.complete ? "Complete" : `${Math.round(coin.graduationProgress * 100)}%`}</dd></div>
        <div><dt>Venue</dt><dd>{coin.tradesOn === "pump-amm" ? "PumpSwap" : coin.tradesOn === "pump" ? "Bonding curve" : coin.tradesOn}</dd></div>
        <div><dt>Buy quote</dt><dd>{#if coin.buyQuote?.tokensOut}{quoteIn ? `${quoteIn} ${coin.quote.symbol} → ` : ""}{fmtQuote(Number(coin.buyQuote.tokensOut), "amount")} tokens{:else}—{/if}</dd></div>
        {#if coin.creator}
          <div><dt>Creator</dt><dd><a href={accountUrl(coin.creator, cluster)} target="_blank" rel="noopener noreferrer" title={coin.creator}>{shortMint(coin.creator)} ↗</a></dd></div>
        {/if}
        <div><dt>Mode</dt><dd>{coin.isMayhemMode ? "Mayhem" : "Standard"}</dd></div>
      </dl>
      {#if coin.note}<p class="notice">{coin.note}</p>{/if}
      <button class="primary wide" onclick={() => trade(coin.mint)}>Trade this coin</button>
    </section>
  </div>
{:else if rows.length === 1 && rows[0]?.error}
  <section class="panel single-error"><span>Curve read failed for {rows[0].mint}</span><p class="error">{rows[0].error}</p></section>
{:else if rows.length > 1}
  <section class="panel compare-panel">
    <div class="panel-title"><span>ranked by graduation progress</span><b>{rows.length} coins · one tool call</b></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Coin</th><th>Progress</th><th>Price</th><th>Market cap</th><th>Venue</th><th></th></tr></thead>
      <tbody>{#each rows as row}
        <tr>
          <td class="mint" title={row.mint}>{shortMint(row.mint)}</td>
          {#if row.curve}
            <td><div class="progress"><i style:width={`${Math.round(row.curve.graduationProgress * 100)}%`}></i></div><span>{Math.round(row.curve.graduationProgress * 100)}%</span></td>
            <td>{fmtQuote(row.curve.priceInQuote, "price")} {row.curve.quote.symbol}</td>
            <td>{fmtQuote(row.curve.marketCapInQuote, "amount")} {row.curve.quote.symbol}</td>
            <td>{row.curve.tradesOn}</td>
            <td><button class="text-button" onclick={() => trade(row.mint)}>Trade</button></td>
          {:else}
            <td colspan="5" class="error">{row.error}</td>
          {/if}
        </tr>
      {/each}</tbody>
    </table></div>
  </section>
{:else if !running}
  <section class="empty"><span>curve / quotes</span><p>Chain data will appear here. Nothing is cached or tracked beyond aggregate MCP call counts.</p></section>
{/if}

<style>
  .search-panel, .panel { border: 1px solid var(--b); border-radius: 9px; background: var(--s1); padding: 20px; }
  .section-head, .panel-title { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .kicker { color: var(--ac); font: 10px var(--mono); text-transform: uppercase; letter-spacing: .12em; }
  h2 { margin: 6px 0 0; font-size: 22px; letter-spacing: -.025em; }
  .source, .panel-title { color: var(--t3); font: 10px var(--mono); }
  .freshness { display: inline-flex; align-items: center; gap: 6px; color: var(--t2); font: 10px var(--mono); white-space: nowrap; }
  .freshness i { width: 6px; height: 6px; border-radius: 50%; background: var(--ac); box-shadow: 0 0 0 0 rgba(25,195,125,.5); animation: pulse 2s infinite; }
  .freshness i.stale { background: var(--warn); animation: none; }
  @keyframes pulse { 70% { box-shadow: 0 0 0 6px rgba(25,195,125,0); } 100% { box-shadow: 0 0 0 0 rgba(25,195,125,0); } }
  @media (prefers-reduced-motion: reduce) { .freshness i { animation: none; } }
  .demo-strip { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-top: 12px; }
  .demo-strip p { margin: 0; color: var(--t2); font-size: 13px; line-height: 1.55; max-width: 62ch; }
  .strip-actions { display: flex; align-items: center; gap: 14px; flex: 0 0 auto; }
  .ghost { padding: 8px 12px; border: 1px solid var(--b2); border-radius: 6px; background: var(--bg); color: var(--t); font-size: 12px; white-space: nowrap; }
  .ghost:hover:not(:disabled) { border-color: var(--ac); }
  .ghost:disabled { opacity: .5; cursor: not-allowed; }
  .intro { color: var(--t2); font-size: 13px; max-width: 70ch; }
  form { display: grid; gap: 12px; margin-top: 18px; }
  label { display: grid; gap: 6px; color: var(--t2); font: 11px var(--mono); }
  label > span { color: var(--t3); }
  textarea, input { box-sizing: border-box; width: 100%; border: 1px solid var(--b); border-radius: 6px; background: var(--bg); color: var(--t); font: 12px var(--mono); padding: 10px; }
  textarea { resize: vertical; }
  .query-row { display: grid; grid-template-columns: 1fr 1fr auto; align-items: end; gap: 12px; }
  .input { display: flex; align-items: center; border: 1px solid var(--b); border-radius: 6px; background: var(--bg); }
  .input input { border: 0; background: transparent; }
  .input i { flex: 0 0 auto; padding-right: 10px; color: var(--t3); font: normal 10px var(--mono); }
  .primary { padding: 10px 16px; border-radius: 6px; background: var(--ac); color: var(--ac-ink); font-weight: 650; white-space: nowrap; }
  .primary:disabled { opacity: .5; cursor: not-allowed; }
  .wide { width: 100%; margin-top: 16px; }
  .notice { color: var(--warn); font-size: 12px; line-height: 1.5; }
  .error { color: var(--err) !important; font-size: 12px; }
  .single-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(260px, 1fr); gap: 14px; margin-top: 14px; }
  .chart-panel { min-width: 0; }
  .coin-address { display: flex; justify-content: space-between; gap: 12px; margin-top: 16px; color: var(--t3); font: 10px var(--mono); }
  .coin-address > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .links { display: flex; gap: 14px; flex: 0 0 auto; }
  .coin-address button, .coin-address a, .text-button { color: var(--ac); padding: 0; font: inherit; white-space: nowrap; text-decoration: none; }
  .text-button { font: 11px var(--mono); }
  .coin-address a:hover, .text-button:hover, dd a:hover { text-decoration: underline; }
  dd a { color: var(--ac); text-decoration: none; }
  .of { color: var(--t3); }
  .facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; margin-top: 16px; border: 1px solid var(--b); border-radius: 7px; overflow: hidden; background: var(--b); }
  .facts:empty { display: none; }
  .facts div:last-child:nth-child(odd) { grid-column: 1 / -1; }
  .facts div { display: grid; gap: 5px; padding: 12px 14px; background: var(--s1); min-width: 0; }
  .facts span { color: var(--t3); font: 10px var(--mono); text-transform: uppercase; letter-spacing: .06em; }
  .facts b { color: var(--t); font: 500 12px var(--mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .facts a { color: var(--ac); text-decoration: none; }
  .facts a:hover { text-decoration: underline; }
  .panel-title b.graduated { color: var(--ac); }
  .panel-title { padding-bottom: 14px; border-bottom: 1px solid var(--b); text-transform: uppercase; letter-spacing: .06em; }
  .panel-title b { color: var(--t2); font-weight: 500; }
  dl { margin: 8px 0; }
  dl div { display: flex; justify-content: space-between; gap: 16px; padding: 9px 0; border-bottom: 1px solid rgba(35,39,47,.55); font-size: 12px; }
  dt { color: var(--t3); } dd { margin: 0; color: var(--t); font-family: var(--mono); text-align: right; overflow-wrap: anywhere; }
  .compare-panel, .single-error { margin-top: 14px; }
  .single-error > span { color: var(--t3); font: 10px var(--mono); overflow-wrap: anywhere; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font: 11px var(--mono); }
  th { padding: 14px 10px 8px; color: var(--t3); text-align: left; font-weight: 500; }
  td { padding: 13px 10px; border-top: 1px solid rgba(35,39,47,.55); color: var(--t2); white-space: nowrap; }
  td.mint { color: var(--t); }
  td:nth-child(2) { min-width: 130px; }
  td:nth-child(2) > span { display: inline-block; margin-left: 8px; }
  .progress { display: inline-block; vertical-align: middle; width: 70px; height: 4px; border-radius: 3px; background: var(--b); overflow: hidden; }
  .progress i { display: block; height: 100%; background: var(--ac); }
  .empty { margin-top: 14px; padding: 44px 20px; border: 1px dashed var(--b); border-radius: 9px; text-align: center; color: var(--t3); }
  .empty span { font: 11px var(--mono); text-transform: uppercase; letter-spacing: .1em; }
  .empty p { margin: 8px auto 0; max-width: 55ch; font-size: 12px; }
  @media (max-width: 900px) { .single-grid { grid-template-columns: 1fr; } }
  @media (max-width: 650px) {
    .query-row { grid-template-columns: 1fr; }
    .query-row .primary { width: 100%; }
    .source { display: none; }
    .demo-strip { flex-direction: column; align-items: stretch; }
    .strip-actions { justify-content: space-between; }
    .coin-address { flex-direction: column; gap: 8px; }
    .search-panel, .panel { padding: 15px; }
    input { font-size: 16px; }
  }
</style>
