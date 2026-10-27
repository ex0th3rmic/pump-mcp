<script lang="ts">
  import { activity } from "../../lib/activity.svelte";
  import { session } from "../../lib/session.svelte";
  import { solscanAccount, solscanTx } from "../../lib/transactions";
  import { shortAddress } from "../../lib/wallet.svelte";

  const succeeded = $derived(activity.items.filter((item) => item.status === "success").length);
  const failed = $derived(activity.items.filter((item) => item.status === "error").length);
</script>

<div class="summary-grid">
  <section class="summary"><span>Session operations</span><b>{activity.items.length}</b><small>in-memory only</small></section>
  <section class="summary"><span>Successful</span><b>{succeeded}</b><small>completed requests</small></section>
  <section class="summary"><span>Errors</span><b class:error={failed > 0}>{failed}</b><small>never retried automatically</small></section>
</div>

<div class="activity-grid">
  <section class="history">
    <div class="panel-head"><div><span class="kicker">this tab session</span><h2>Activity</h2></div>{#if activity.items.length}<button onclick={() => activity.clear()}>Clear history</button>{/if}</div>
    {#if activity.items.length}
      <div class="table-wrap"><table><thead><tr><th>Time</th><th>Operation</th><th>Status</th><th>Duration</th><th>Reference</th></tr></thead><tbody>
        {#each activity.items as item}
          <tr>
            <td>{new Date(item.at).toLocaleTimeString()}</td>
            <td>{item.label}</td>
            <td><span class="status" class:good={item.status === "success"} class:bad={item.status === "error"}>{item.status}</span></td>
            <td>{item.ms === undefined ? "—" : `${item.ms} ms`}</td>
            <td>
              {#if item.signature}<a href={solscanTx(item.signature, session.health?.cluster ?? "mainnet-beta")} target="_blank" rel="noopener">{shortAddress(item.signature)}</a>
              {:else if item.mint}<a href={solscanAccount(item.mint, session.health?.cluster ?? "mainnet-beta")} target="_blank" rel="noopener">{shortAddress(item.mint)}</a>
              {:else}—{/if}
            </td>
          </tr>
        {/each}
      </tbody></table></div>
    {:else}
      <div class="empty"><span>No operations yet</span><p>Curve reads, previews, metadata pins, and submissions will appear here. Source code, tokens, transactions, and API responses are not recorded.</p></div>
    {/if}
  </section>

  <aside class="health">
    <div class="panel-head"><div><span class="kicker">this deployment</span><h2>Health</h2></div><button onclick={() => void session.refreshHealth()}>Refresh</button></div>
    {#if session.health}
      <dl>
        <div><dt>Version</dt><dd>v{session.health.version}</dd></div>
        <div><dt>Cluster</dt><dd>{session.health.cluster}</dd></div>
        <div><dt>MCP authentication</dt><dd class:off={!session.health.auth}>{session.health.auth ? "configured" : "off"}</dd></div>
        <div><dt>Solana RPC</dt><dd class:off={!session.health.rpc}>{session.health.rpc ? "configured" : "off"}</dd></div>
        <div><dt>Official pump.fun key</dt><dd class:off={!session.health.officialKey}>{session.health.officialKey ? "configured" : "not configured"}</dd></div>
        <div><dt>Metadata pinning</dt><dd class:off={!session.health.metadataUpload}>{session.health.metadataUpload ? "configured" : "off"}</dd></div>
        <div><dt>Create + dev buy</dt><dd class:off={!session.health.devBuyInCreate}>{session.health.devBuyInCreate ? "lookup table ready" : "zero buy only"}</dd></div>
        <div><dt>API mode</dt><dd>{session.health.mode}</dd></div>
      </dl>
    {:else}<p class="error">{session.healthError || "Loading health…"}</p>{/if}
    <div class="analytics"><b>Aggregate usage</b><p>Cloudflare Analytics Engine counts page views and MCP tools only—never tokens, IPs, code, or request bodies.</p><a href="https://dash.cloudflare.com/" target="_blank" rel="noopener">Open Cloudflare dashboard</a></div>
  </aside>
</div>

<style>
  .summary-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 14px; }
  .summary, .history, .health { border: 1px solid var(--b); border-radius: 8px; background: var(--s1); padding: 18px; }
  .summary > span { color: var(--t3); font: 10px var(--mono); }
  .summary b { display: block; margin: 6px 0 2px; font: 26px var(--mono); }
  .summary b.error { color: var(--err); }
  .summary small { color: var(--t3); font-size: 10px; }
  .activity-grid { display: grid; grid-template-columns: minmax(0,1.5fr) minmax(280px,.7fr); gap: 14px; align-items: start; }
  .panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
  .kicker { color: var(--ac); font: 9px var(--mono); text-transform: uppercase; letter-spacing: .1em; }
  h2 { margin: 5px 0 0; font-size: 19px; }
  .panel-head button { padding: 0; color: var(--t3); font: 10px var(--mono); }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font: 10px var(--mono); }
  th, td { padding: 10px 8px; border-top: 1px solid rgba(35,39,47,.6); text-align: left; white-space: nowrap; }
  th { color: var(--t3); font-weight: 500; } td { color: var(--t2); }
  td a { color: var(--ac); }
  .status { color: var(--warn); } .status.good { color: var(--ac); } .status.bad { color: var(--err); }
  dl { margin: 0; }
  dl div { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-top: 1px solid rgba(35,39,47,.6); font-size: 11px; }
  dt { color: var(--t3); } dd { margin: 0; color: var(--ac); font-family: var(--mono); text-align: right; } dd.off { color: var(--warn); }
  .empty { padding: 46px 20px; text-align: center; color: var(--t3); }
  .empty span { font: 11px var(--mono); }
  .empty p { max-width: 55ch; margin: 8px auto 0; font-size: 11px; line-height: 1.55; }
  .analytics { margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--b); }
  .analytics b { color: var(--t2); font-size: 12px; }
  .analytics p { color: var(--t3); font-size: 11px; line-height: 1.55; }
  .analytics a { color: var(--ac); font-size: 11px; }
  .error { color: var(--err); font-size: 12px; }
  @media (max-width: 900px) { .activity-grid { grid-template-columns: 1fr; } }
  @media (max-width: 600px) { .summary-grid { grid-template-columns: 1fr; } .summary { padding: 13px 16px; } .summary b { font-size: 20px; } }
</style>
