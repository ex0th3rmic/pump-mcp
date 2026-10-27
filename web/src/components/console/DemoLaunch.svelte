<script lang="ts"></script>

<div class="demo-grid">
  <section class="panel">
    <span class="kicker">read-only workflow</span><h2>Walk through a token launch.</h2>
    <p class="intro">See the metadata and create-transaction steps without pinning content, generating a mint, or connecting a wallet.</p>
    <div class="steps"><span class="active">01 Details</span><span>02 Metadata</span><span>03 Launch</span></div>
    <div class="fields">
      <div class="split"><label>Name<input value="Demo Coin" readonly /></label><label>Symbol<input value="DEMO" readonly /></label></div>
      <label>Description<textarea readonly rows="3">A sample token launch for exploring Pump MCP.</textarea></label>
      <label>Metadata URI<input value="ipfs://sample-metadata-not-pinned" readonly /></label>
      <div class="split"><label>Developer buy SOL<input value="0.05" readonly /></label><label>Slippage %<input value="10" readonly /></label></div>
      <label>Creator wallet<input value="Available after operator unlock" readonly /></label>
    </div>
    <button class="primary" disabled>Operator unlock required to pin and launch</button>
    <p class="note">No metadata was uploaded and no mint was created.</p>
  </section>
  <section class="panel">
    <div class="preview-head"><div><span class="kicker">sample data</span><h3>Example create preview</h3></div><span class="sample">sample</span></div>
    <dl>
      <div><dt>Action</dt><dd>create + dev buy</dd></div>
      <div><dt>Quote in</dt><dd>0.05 SOL</dd></div>
      <div><dt>Estimated tokens out</dt><dd>250,000</dd></div>
      <div><dt>Mint</dt><dd>Generated per real launch</dd></div>
      <div><dt>Mint signature</dt><dd>Server-signed once</dd></div>
      <div><dt>Creator signature</dt><dd>Your wallet</dd></div>
    </dl>
    <div class="lifecycle"><span>01 Pin</span><i></i><span>02 Preview</span><i></i><span>03 Sign</span><i></i><span>04 Confirm</span></div>
    <div class="safe"><b>Nothing is uploaded or launched.</b><p>Operator mode separates explicit IPFS pinning from transaction building so metadata is never uploaded as a side effect of previewing.</p></div>
  </section>
</div>

<style>
  .demo-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; align-items: start; }
  .panel { min-width: 0; padding: 20px; border: 1px solid var(--b); border-radius: 9px; background: var(--s1); }
  .kicker { color: var(--ac); font: 10px var(--mono); text-transform: uppercase; letter-spacing: .1em; }
  h2 { margin: 6px 0 8px; font-size: 22px; } h3 { margin: 5px 0 0; font-size: 18px; }
  .intro { color: var(--t2); font-size: 12px; line-height: 1.55; }
  .steps { display: flex; gap: 16px; margin: 18px 0; color: var(--t3); font: 9px var(--mono); text-transform: uppercase; } .steps .active { color: var(--ac); }
  .fields { display: grid; gap: 12px; } .split { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  label { display: grid; gap: 6px; color: var(--t2); font: 10px var(--mono); }
  input, textarea { box-sizing: border-box; width: 100%; padding: 10px; border: 1px solid var(--b); border-radius: 6px; background: var(--bg); color: var(--t3); font: 12px var(--mono); resize: none; }
  .primary { width: 100%; margin-top: 18px; padding: 11px; border-radius: 6px; background: var(--ac); color: var(--ac-ink); font-weight: 650; opacity: .45; cursor: not-allowed; }
  .note { color: var(--t3); font-size: 11px; }
  .preview-head { display: flex; justify-content: space-between; gap: 12px; }
  .sample { height: fit-content; padding: 3px 6px; border-radius: 4px; background: rgba(217,165,59,.1); color: var(--warn); font: 9px var(--mono); text-transform: uppercase; }
  dl { margin: 18px 0; } dl div { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid rgba(35,39,47,.6); font-size: 11px; }
  dt { color: var(--t3); } dd { margin: 0; color: var(--t2); font-family: var(--mono); text-align: right; }
  .lifecycle { display: flex; align-items: center; gap: 8px; color: var(--ac); font: 9px var(--mono); text-transform: uppercase; } .lifecycle i { flex: 1; height: 1px; background: var(--b); }
  .safe { margin-top: 20px; padding: 12px; border: 1px solid var(--b); border-radius: 6px; background: var(--bg); }
  .safe b { color: var(--t2); font-size: 12px; } .safe p { margin: 5px 0 0; color: var(--t3); font-size: 11px; line-height: 1.5; }
  @media (max-width: 900px) { .demo-grid { grid-template-columns: 1fr; } }
  @media (max-width: 600px) { .panel { padding: 15px; } }
</style>
