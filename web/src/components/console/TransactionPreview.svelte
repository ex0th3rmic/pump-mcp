<script lang="ts">
  import type { TradeResult } from "../../lib/types";
  import { shortAddress } from "../../lib/wallet.svelte";
  import { solscanTx, type TransactionPhase } from "../../lib/transactions";
  import { session } from "../../lib/session.svelte";

  let {
    preview,
    stale = false,
    simulating = false,
    simulated = false,
    simulationError = "",
    logs = [],
    submitting = false,
    phase = "preview",
    signature = "",
    error = "",
    onSimulate,
    onSubmit,
  }: {
    preview: TradeResult | null;
    stale?: boolean;
    simulating?: boolean;
    simulated?: boolean;
    simulationError?: string;
    logs?: string[];
    submitting?: boolean;
    phase?: TransactionPhase;
    signature?: string;
    error?: string;
    onSimulate: () => void;
    onSubmit: () => void;
  } = $props();

  let accepted = $state(false);
  let previousTransaction = $state("");
  $effect(() => {
    if (preview?.transaction !== previousTransaction) {
      previousTransaction = preview?.transaction ?? "";
      accepted = false;
    }
  });

  const terminal = $derived(["confirmed", "finalized", "failed", "expired"].includes(phase));
</script>

{#if preview}
  <section class="preview">
    <div class="preview-head">
      <div><span class="kicker">immutable preview</span><h3>{preview.action} on {preview.venue === "pump" ? "bonding curve" : "PumpSwap"}</h3></div>
      <span class:stale class="state">{stale ? "needs rebuild" : simulated ? "simulated" : "unsigned"}</span>
    </div>
    {#if stale}<p class="warning">Inputs or the wallet changed. Build a new preview before simulating or signing.</p>{/if}
    <dl>
      <div><dt>Mint</dt><dd title={preview.mint}>{shortAddress(preview.mint)}</dd></div>
      {#if preview.quote.quoteIn !== undefined}<div><dt>Quote in</dt><dd>{preview.quote.quoteIn} {preview.quote.quoteSymbol}</dd></div>{/if}
      {#if preview.quote.tokensOut}<div><dt>Tokens out</dt><dd>{preview.quote.tokensOut}</dd></div>{/if}
      {#if preview.quote.tokensIn}<div><dt>Tokens in</dt><dd>{preview.quote.tokensIn}</dd></div>{/if}
      {#if preview.quote.quoteOut}<div><dt>Quote out</dt><dd>{preview.quote.quoteOut} {preview.quote.quoteSymbol}</dd></div>{/if}
      <div><dt>Slippage</dt><dd>{preview.quote.slippagePct}%</dd></div>
      <div><dt>Transaction</dt><dd>{preview.bytes} bytes · v0</dd></div>
      <div><dt>Last valid height</dt><dd>{preview.lastValidBlockHeight}</dd></div>
      <div><dt>Required signers</dt><dd>{preview.requiredSigners.map(shortAddress).join(", ")}</dd></div>
      {#if preview.signedBy.length}<div><dt>Already signed</dt><dd>{preview.signedBy.map(shortAddress).join(", ")}</dd></div>{/if}
    </dl>
    <p class="note">{preview.note}</p>

    <div class="lifecycle" aria-label="Transaction lifecycle">
      <span class="done">01 Preview</span><i></i><span class:done={simulated}>02 Simulate</span><i></i><span class:done={Boolean(signature)}>03 Sign</span><i></i><span class:done={terminal || phase === "submitted" || phase === "not-found"}>04 Confirm</span>
    </div>

    {#if !simulated}
      <button class="secondary" disabled={stale || simulating || submitting} onclick={onSimulate}>{simulating ? "Simulating exact transaction…" : "Simulate transaction"}</button>
    {:else}
      <div class="simulation-ok">Simulation returned no execution error. Inclusion and future chain state are not guaranteed.</div>
    {/if}
    {#if simulationError}<pre class="error-log">{simulationError}</pre>{/if}
    {#if logs.length}<details><summary>Simulation logs</summary><pre>{logs.join("\n")}</pre></details>{/if}

    {#if simulated && !signature}
      <label class="accept"><input type="checkbox" bind:checked={accepted} disabled={stale || submitting} /><span>I reviewed this exact transaction and explicitly authorize wallet signing and submission on <b>{session.health?.cluster ?? "the configured cluster"}</b>.</span></label>
      <button class="primary" disabled={!accepted || stale || submitting} onclick={onSubmit}>{submitting ? "Waiting for wallet / RPC…" : "Sign and submit"}</button>
    {/if}

    {#if signature}
      <div class="result" class:pending={phase === "submitted" || phase === "not-found"} class:failed={phase === "failed" || phase === "expired"}>
        <span>status</span><b>{phase}</b>
        {#if phase === "not-found"}<p>No provider record yet. Checking until the blockhash expires; do not resubmit blindly.</p>{/if}
        {#if phase === "expired"}<p>The blockhash expired without confirmation. Inspect the signature before building another transaction.</p>{/if}
        <a href={solscanTx(signature, session.health?.cluster ?? "mainnet-beta")} target="_blank" rel="noopener">View transaction on Solscan</a>
        <code>{signature}</code>
      </div>
    {/if}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
  </section>
{/if}

<style>
  .preview { border: 1px solid var(--b); border-radius: 9px; background: var(--s1); padding: 20px; }
  .preview-head { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
  .kicker { color: var(--ac); font: 10px var(--mono); text-transform: uppercase; letter-spacing: .1em; }
  h3 { margin: 5px 0 0; font-size: 18px; text-transform: capitalize; }
  .state { padding: 4px 7px; border-radius: 4px; background: var(--ac-bg); color: var(--ac); font: 10px var(--mono); }
  .state.stale { color: var(--warn); background: rgba(217,165,59,.1); }
  dl { margin: 18px 0 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 0 24px; }
  dl div { min-width: 0; display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(35,39,47,.6); font-size: 11px; }
  dt { color: var(--t3); } dd { margin: 0; color: var(--t2); font-family: var(--mono); text-align: right; overflow-wrap: anywhere; }
  .note { color: var(--t3); font-size: 11px; line-height: 1.5; }
  .lifecycle { display: flex; align-items: center; gap: 8px; margin: 18px 0; color: var(--t3); font: 9px var(--mono); text-transform: uppercase; }
  .lifecycle i { flex: 1; height: 1px; background: var(--b); }
  .lifecycle .done { color: var(--ac); }
  button { padding: 10px 15px; border-radius: 6px; font-weight: 600; }
  button:disabled { opacity: .45; cursor: not-allowed; }
  .secondary { border: 1px solid var(--b2); color: var(--t); background: var(--s2); }
  .primary { width: 100%; background: var(--ac); color: var(--ac-ink); }
  .simulation-ok { margin-bottom: 14px; padding: 10px; border: 1px solid rgba(25,195,125,.25); border-radius: 6px; background: var(--ac-bg); color: var(--ac); font-size: 11px; }
  .accept { display: flex; align-items: flex-start; gap: 9px; margin: 16px 0 12px; color: var(--t2); font-size: 12px; line-height: 1.5; }
  .accept input { margin-top: 3px; accent-color: var(--ac); }
  .accept b { color: var(--t); }
  .warning, .error { color: var(--warn); font-size: 12px; }
  .error { color: var(--err); }
  .error-log, details pre { max-height: 180px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--err); background: var(--bg); padding: 10px; border-radius: 5px; font: 10px/1.5 var(--mono); }
  details { margin: 10px 0; color: var(--t3); font: 11px var(--mono); }
  details pre { color: var(--t2); }
  .result { margin-top: 18px; padding: 14px; border: 1px solid rgba(25,195,125,.3); border-radius: 6px; background: var(--ac-bg); }
  .result > span { color: var(--t3); font: 9px var(--mono); text-transform: uppercase; }
  .result > b { display: block; color: var(--ac); font: 16px var(--mono); text-transform: capitalize; }
  .result p { color: var(--t2); font-size: 11px; }
  .result a { display: inline-block; margin: 8px 0; color: var(--ac); font-size: 12px; }
  .result code { display: block; overflow-wrap: anywhere; color: var(--t3); font-size: 9px; }
  .result.pending { border-color: rgba(217,165,59,.3); background: rgba(217,165,59,.08); }
  .result.pending > b { color: var(--warn); }
  .result.failed { border-color: rgba(229,104,79,.35); background: rgba(229,104,79,.08); }
  .result.failed > b { color: var(--err); }
  @media (max-width: 600px) { dl { grid-template-columns: 1fr; } .lifecycle { font-size: 8px; gap: 4px; } .preview { padding: 15px; } }
</style>
