<script lang="ts">
  import Curve from "../Curve.svelte";
  import { activity } from "../../lib/activity.svelte";
  import { curveQueryCode, parseMints, type CoinComparisonRow } from "../../lib/coins";
  import { fmtQuote, shortMint } from "../../lib/curve";
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
  const demo = $derived(!session.token);

  $effect(() => {
    if (!demo && !loaded && !mints) {
      loaded = true;
      fetch("/api/showcase")
        .then((response) => response.ok ? response.json() as Promise<{ mint: string }> : null)
        .then((showcase) => { if (showcase && !mints) mints = showcase.mint; })
        .catch(() => {});
    }
    if (demo && !demoLoaded) {
      demoLoaded = true;
      void inspect();
    }
  });

  async function inspect() {
    error = "";
    if (demo) {
      running = true;
      const started = Date.now();
      const event = activity.start("Read public showcase");
      try {
        const response = await fetch("/api/showcase");
        if (!response.ok) throw new Error(`Public showcase returned ${response.status}`);
        const curve = await response.json() as CurveData;
        mints = curve.mint;
        buyAmount = "0.5";
        rows = [{ mint: curve.mint, curve }];
        activity.finish(event, "success", Date.now() - started, { mint: curve.mint });
      } catch (cause) {
        error = cause instanceof Error ? cause.message : String(cause);
        activity.finish(event, "error", Date.now() - started);
      } finally {
        running = false;
      }
      return;
    }
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
    <span class="source">{demo ? "public showcase · cached 20s" : "Solana RPC · live chain state"}</span>
  </div>
  <p class="intro">{demo ? "This fixed pump.fun coin is live chain data. Operator unlock enables arbitrary mint searches and eight-coin comparisons." : "Paste one mint for a full curve view, or up to eight to compare graduation progress and quotes in one execute call."}</p>
  <form onsubmit={(event) => { event.preventDefault(); void inspect(); }}>
    <label for="mints">Mint addresses <span>{demo ? "fixed public showcase" : "comma, space, or newline separated"}</span></label>
    <textarea id="mints" bind:value={mints} readonly={demo} rows="3" spellcheck="false" placeholder="9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump"></textarea>
    <div class="query-row">
      <label>Buy quote <span class="input"><input bind:value={buyAmount} readonly={demo} inputmode="decimal" aria-label="Buy quote amount" /><i>quote units</i></span></label>
        <label>Sell quote <span class="input"><input bind:value={sellTokens} readonly={demo} inputmode="decimal" aria-label="Sell quote token amount" placeholder={demo ? "operator only" : "optional"} /><i>tokens</i></span></label>
      <button class="primary" type="submit" disabled={running || session.health?.rpc === false}>{running ? "Reading chain…" : demo ? "Refresh showcase" : rows.length ? "Refresh curves" : "Read curves"}</button>
    </div>
  </form>
  {#if session.health?.rpc === false}<p class="notice">Set RPC_URL on the Worker to enable curve reads.</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

{#if rows.length === 1 && rows[0]?.curve}
  {@const coin = rows[0].curve}
  <div class="single-grid">
    <section class="panel chart-panel">
      <Curve showcase={coin} state="live" />
      <div class="coin-address"><span>{coin.mint}</span><button onclick={() => navigator.clipboard.writeText(coin.mint)}>copy mint</button></div>
    </section>
    <section class="panel stats-panel">
      <div class="panel-title"><span>curve state</span><b>{coin.complete ? "Graduated" : "Active"}</b></div>
      <dl>
        <div><dt>Price</dt><dd>{fmtQuote(coin.priceInQuote, "price")} {coin.quote.symbol}</dd></div>
        <div><dt>Market cap</dt><dd>{fmtQuote(coin.marketCapInQuote, "amount")} {coin.quote.symbol}</dd></div>
        <div><dt>Graduation</dt><dd>{Math.round(coin.graduationProgress * 100)}%</dd></div>
        <div><dt>Venue</dt><dd>{coin.tradesOn}</dd></div>
        <div><dt>Buy quote</dt><dd>{coin.buyQuote?.tokensOut ? `${coin.buyQuote.tokensOut} tokens` : "—"}</dd></div>
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
  .coin-address span { overflow: hidden; text-overflow: ellipsis; }
  .coin-address button, .text-button { color: var(--ac); padding: 0; font: inherit; white-space: nowrap; }
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
    .search-panel, .panel { padding: 15px; }
    input { font-size: 16px; }
  }
</style>
