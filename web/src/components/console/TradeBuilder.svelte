<script lang="ts">
  import { onDestroy } from "svelte";
  import TransactionPreview from "./TransactionPreview.svelte";
  import { activity } from "../../lib/activity.svelte";
  import { BASE58_MINT } from "../../lib/coins";
  import { session } from "../../lib/session.svelte";
  import {
    broadcastTrade,
    buildTrade,
    checkConfirmation,
    nextPoll,
    signTrade,
    simulateTrade,
    type TransactionPhase,
  } from "../../lib/transactions";
  import type { TradeResult } from "../../lib/types";
  import { wallet } from "../../lib/wallet.svelte";

  let action = $state<"buy" | "sell">("buy");
  let mint = $state(session.selectedMint);
  let amount = $state("0.05");
  let slippage = $state("10");
  let priorityFee = $state("0.0001");
  let preview = $state<TradeResult | null>(null);
  let previewKey = $state("");
  let building = $state(false);
  let simulating = $state(false);
  let simulated = $state(false);
  let simulationError = $state("");
  let logs = $state<string[]>([]);
  let submitting = $state(false);
  let phase = $state<TransactionPhase>("preview");
  let signature = $state("");
  let error = $state("");
  let runId = 0;

  const formKey = $derived(JSON.stringify([action, mint, amount, slippage, priorityFee, wallet.account?.address]));
  const stale = $derived(Boolean(preview && previewKey !== formKey));

  function setAction(next: "buy" | "sell") {
    action = next;
    amount = next === "buy" ? "0.05" : "100%";
  }

  function body(): Record<string, unknown> {
    if (!wallet.account) throw new Error("Connect a wallet first.");
    if (!BASE58_MINT.test(mint.trim())) throw new Error("Enter a valid base58 mint address.");
    const numericSlippage = Number(slippage);
    const numericPriorityFee = Number(priorityFee);
    if (!Number.isFinite(numericSlippage) || numericSlippage < 0 || numericSlippage >= 100) throw new Error("Slippage must be from 0 through 99 percent.");
    if (!Number.isFinite(numericPriorityFee) || numericPriorityFee < 0 || numericPriorityFee > 0.1) throw new Error("Priority fee must be from 0 through 0.1 SOL.");
    if (action === "buy" && (!(Number(amount) > 0) || !Number.isFinite(Number(amount)))) throw new Error("Buy amount must be a positive number.");
    if (action === "sell" && !(/^\d+(\.\d+)?%$/.test(amount) || (Number.isFinite(Number(amount)) && Number(amount) > 0))) throw new Error("Sell amount must be tokens or a percentage such as 100%.");
    return {
      publicKey: wallet.account.address,
      action,
      mint: mint.trim(),
      amount: action === "buy" ? Number(amount) : amount.trim(),
      denominatedInSol: action === "buy",
      slippage: numericSlippage,
      priorityFee: numericPriorityFee,
      pool: "auto",
    };
  }

  async function build() {
    error = "";
    simulationError = "";
    let request: Record<string, unknown>;
    try { request = body(); } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); return; }
    const requestKey = formKey;
    const id = ++runId;
    building = true;
    preview = null;
    signature = "";
    simulated = false;
    logs = [];
    phase = "preview";
    const started = Date.now();
    const event = activity.start(`Build ${action} preview`, request.mint as string);
    try {
      const result = await buildTrade(session.token, request);
      if (id !== runId) return;
      preview = result;
      previewKey = requestKey;
      activity.finish(event, "success", Date.now() - started, { mint: result.mint });
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      activity.finish(event, "error", Date.now() - started);
    } finally {
      building = false;
    }
  }

  async function simulate() {
    if (!preview || stale) return;
    error = "";
    simulationError = "";
    logs = [];
    simulating = true;
    simulated = false;
    try {
      const result = await simulateTrade(session.token, preview);
      logs = result.logs;
      if (result.err) {
        simulationError = JSON.stringify(result.err, null, 2);
      } else {
        simulated = true;
        phase = "simulated";
      }
    } catch (cause) {
      simulationError = cause instanceof Error ? cause.message : String(cause);
    } finally {
      simulating = false;
    }
  }

  async function submit() {
    if (!preview || !simulated || stale) return;
    const id = ++runId;
    submitting = true;
    error = "";
    phase = "signing";
    try {
      const signed = await signTrade(preview, session.health?.cluster ?? "mainnet-beta", wallet.signTransaction.bind(wallet));
      if (id !== runId) return;
      phase = "submitted";
      const started = Date.now();
      const event = activity.start(`Submit ${preview.action}`, preview.mint);
      try {
        signature = await broadcastTrade(session.token, signed);
        activity.finish(event, "success", Date.now() - started, { mint: preview.mint, signature });
      } catch (cause) {
        activity.finish(event, "error", Date.now() - started, { mint: preview.mint });
        throw cause;
      }
      void poll(id, preview);
    } catch (cause) {
      phase = "preview";
      error = cause instanceof Error ? cause.message : String(cause);
    } finally {
      submitting = false;
    }
  }

  async function poll(id: number, submitted: TradeResult) {
    while (id === runId && signature) {
      await nextPoll();
      if (id !== runId) return;
      try {
        const result = await checkConfirmation(session.token, signature, submitted.lastValidBlockHeight);
        phase = result.phase;
        if (result.error) error = JSON.stringify(result.error);
        if (["confirmed", "finalized", "failed", "expired"].includes(result.phase)) return;
      } catch (cause) {
        error = `Confirmation check stopped: ${cause instanceof Error ? cause.message : String(cause)}. Inspect the signature before taking any other action.`;
        return;
      }
    }
  }

  onDestroy(() => { runId++; });
</script>

<div class="trade-grid">
  <section class="trade-form">
    <span class="kicker">non-custodial execution</span>
    <h2>Build. Simulate. Sign.</h2>
    <p class="intro">The Worker builds an unsigned transaction with pump.fun's official SDK. Your wallet signs it; nothing moves on preview or simulation.</p>
    <div class="tabs" aria-label="Trade action">
      <button class:active={action === "buy"} onclick={() => setAction("buy")}>Buy</button>
      <button class:active={action === "sell"} onclick={() => setAction("sell")}>Sell</button>
    </div>
    <div class="fields">
      <label>Token mint<input bind:value={mint} spellcheck="false" placeholder="Token mint address" /></label>
      <label>{action === "buy" ? "Buy amount in quote units" : "Tokens or percentage"}<input bind:value={amount} inputmode="decimal" placeholder={action === "buy" ? "0.05" : "100%"} /><small>{action === "buy" ? "SOL for classic SOL-paired coins" : "Use 100%, 50%, or a token amount"}</small></label>
      <div class="split">
        <label>Slippage %<input bind:value={slippage} inputmode="decimal" /></label>
        <label>Priority fee SOL<input bind:value={priorityFee} inputmode="decimal" /></label>
      </div>
      <label>Signing wallet<input value={wallet.account?.address ?? ""} readonly placeholder="Connect a wallet above" /></label>
    </div>
    {#if error && !preview}<p class="error" role="alert">{error}</p>{/if}
    {#if stale}<p class="warning">The form changed. Build a fresh preview.</p>{/if}
    <button class="primary" disabled={building || submitting || !wallet.account || session.health?.rpc === false} onclick={build}>{building ? "Building from live chain state…" : preview ? "Rebuild preview" : "Build transaction preview"}</button>
    {#if !wallet.account}<p class="hint">Connect a Wallet Standard-compatible wallet to build a transaction for your public key.</p>{/if}
    {#if session.health?.rpc === false}<p class="warning">RPC_URL is not configured on this Worker.</p>{/if}
    <div class="safety"><span>No private keys</span><span>Preflight enabled</span><span>No automatic retries</span></div>
  </section>
  <div>
    <TransactionPreview
      {preview}
      {stale}
      {simulating}
      {simulated}
      {simulationError}
      {logs}
      {submitting}
      {phase}
      {signature}
      {error}
      onSimulate={() => void simulate()}
      onSubmit={() => void submit()}
    />
    {#if !preview}<section class="empty"><span>awaiting preview</span><p>Quotes, signers, simulation, and confirmation will appear here.</p></section>{/if}
  </div>
</div>

<style>
  .trade-grid { display: grid; grid-template-columns: minmax(300px, .85fr) minmax(360px, 1.15fr); gap: 14px; align-items: start; }
  .trade-form, .empty { padding: 20px; border: 1px solid var(--b); border-radius: 9px; background: var(--s1); }
  .kicker { color: var(--ac); font: 10px var(--mono); text-transform: uppercase; letter-spacing: .1em; }
  h2 { margin: 6px 0 8px; font-size: 22px; letter-spacing: -.025em; }
  .intro { color: var(--t2); font-size: 12px; line-height: 1.55; }
  .tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 20px 0 16px; padding: 4px; background: var(--bg); border-radius: 7px; }
  .tabs button { padding: 8px; border-radius: 5px; color: var(--t3); }
  .tabs button.active { background: var(--s2); color: var(--ac); }
  .fields { display: grid; gap: 12px; }
  label { display: grid; gap: 6px; color: var(--t2); font: 10px var(--mono); }
  input { box-sizing: border-box; width: 100%; padding: 10px; border: 1px solid var(--b); border-radius: 6px; background: var(--bg); color: var(--t); font: 12px var(--mono); }
  input[readonly] { color: var(--t3); }
  label small { color: var(--t3); }
  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .primary { width: 100%; margin-top: 18px; padding: 11px; border-radius: 6px; background: var(--ac); color: var(--ac-ink); font-weight: 650; }
  .primary:disabled { opacity: .45; cursor: not-allowed; }
  .hint, .warning, .error { color: var(--t3); font-size: 11px; line-height: 1.5; }
  .warning { color: var(--warn); } .error { color: var(--err); }
  .safety { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; color: var(--t3); font: 9px var(--mono); }
  .empty { padding: 50px 20px; text-align: center; color: var(--t3); }
  .empty span { font: 10px var(--mono); text-transform: uppercase; letter-spacing: .1em; }
  .empty p { font-size: 12px; }
  @media (max-width: 950px) { .trade-grid { grid-template-columns: 1fr; } }
  @media (max-width: 600px) { .trade-form { padding: 15px; } input { font-size: 16px; } }
</style>
