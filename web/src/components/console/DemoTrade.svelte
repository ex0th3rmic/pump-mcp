<script lang="ts">
  import { onMount } from "svelte";

  let mint = $state("Loading showcase mint…");
  onMount(async () => {
    try {
      const response = await fetch("/api/showcase");
      if (response.ok) mint = (await response.json() as { mint: string }).mint;
    } catch {
      mint = "Showcase unavailable";
    }
  });
</script>

<div class="demo-grid">
  <section class="panel">
    <span class="kicker">read-only workflow</span><h2>See how a trade is prepared.</h2>
    <p class="intro">These fields show the operator workflow. Demo mode does not connect a wallet, build transactions, or use the private MCP endpoint.</p>
    <div class="tabs"><button class="active">Buy</button><button disabled>Sell</button></div>
    <div class="fields">
      <label>Token mint<input value={mint} readonly /></label>
      <label>Buy amount in quote units<input value="0.05" readonly /></label>
      <div class="split"><label>Slippage %<input value="10" readonly /></label><label>Priority fee SOL<input value="0.0001" readonly /></label></div>
      <label>Signing wallet<input value="Available after operator unlock" readonly /></label>
    </div>
    <button class="primary" disabled>Operator unlock required to build</button>
    <p class="note">No transaction has been created.</p>
  </section>
  <section class="panel">
    <div class="preview-head"><div><span class="kicker">sample data</span><h3>Example buy preview</h3></div><span class="sample">sample</span></div>
    <dl>
      <div><dt>Venue</dt><dd>pump bonding curve</dd></div>
      <div><dt>Quote in</dt><dd>0.05 SOL</dd></div>
      <div><dt>Estimated tokens out</dt><dd>128,430</dd></div>
      <div><dt>Slippage</dt><dd>10%</dd></div>
      <div><dt>Transaction</dt><dd>775 bytes · v0</dd></div>
      <div><dt>Required signer</dt><dd>Your wallet</dd></div>
    </dl>
    <div class="lifecycle"><span>01 Preview</span><i></i><span>02 Simulate</span><i></i><span>03 Sign</span><i></i><span>04 Confirm</span></div>
    <div class="safe"><b>Nothing runs in demo mode.</b><p>Operator mode adds live building, exact-transaction simulation, explicit Wallet Standard signing, and confirmation tracking.</p></div>
  </section>
</div>

<style>
  .demo-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; align-items: start; }
  .panel { min-width: 0; padding: 20px; border: 1px solid var(--b); border-radius: 9px; background: var(--s1); }
  .kicker { color: var(--ac); font: 10px var(--mono); text-transform: uppercase; letter-spacing: .1em; }
  h2 { margin: 6px 0 8px; font-size: 22px; } h3 { margin: 5px 0 0; font-size: 18px; }
  .intro { color: var(--t2); font-size: 12px; line-height: 1.55; }
  .tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 20px 0 16px; padding: 4px; background: var(--bg); border-radius: 7px; }
  .tabs button { padding: 8px; border-radius: 5px; color: var(--t3); } .tabs .active { background: var(--s2); color: var(--ac); }
  .fields { display: grid; gap: 12px; } .split { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  label { display: grid; gap: 6px; color: var(--t2); font: 10px var(--mono); }
  input { box-sizing: border-box; width: 100%; padding: 10px; border: 1px solid var(--b); border-radius: 6px; background: var(--bg); color: var(--t3); font: 12px var(--mono); overflow: hidden; text-overflow: ellipsis; }
  .primary { width: 100%; margin-top: 18px; padding: 11px; border-radius: 6px; background: var(--ac); color: var(--ac-ink); font-weight: 650; opacity: .45; cursor: not-allowed; }
  .note { color: var(--t3); font-size: 11px; }
  .preview-head { display: flex; justify-content: space-between; gap: 12px; }
  .sample { height: fit-content; padding: 3px 6px; border-radius: 4px; background: rgba(217,165,59,.1); color: var(--warn); font: 9px var(--mono); text-transform: uppercase; }
  dl { margin: 18px 0; }
  dl div { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid rgba(35,39,47,.6); font-size: 11px; }
  dt { color: var(--t3); } dd { margin: 0; color: var(--t2); font-family: var(--mono); text-align: right; }
  .lifecycle { display: flex; align-items: center; gap: 8px; color: var(--ac); font: 9px var(--mono); text-transform: uppercase; }
  .lifecycle i { flex: 1; height: 1px; background: var(--b); }
  .safe { margin-top: 20px; padding: 12px; border: 1px solid var(--b); border-radius: 6px; background: var(--bg); }
  .safe b { color: var(--t2); font-size: 12px; } .safe p { margin: 5px 0 0; color: var(--t3); font-size: 11px; line-height: 1.5; }
  @media (max-width: 900px) { .demo-grid { grid-template-columns: 1fr; } }
  @media (max-width: 600px) { .panel { padding: 15px; } }
</style>
