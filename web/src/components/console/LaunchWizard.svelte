<script lang="ts">
  import { onDestroy } from "svelte";
  import TransactionPreview from "./TransactionPreview.svelte";
  import { activity } from "../../lib/activity.svelte";
  import { fileToDataUrl, pinMetadata, validateMetadata, validateMetadataUri } from "../../lib/metadata";
  import { navigate } from "../../lib/router.svelte";
  import { session } from "../../lib/session.svelte";
  import {
    broadcastTrade,
    buildTrade,
    checkConfirmation,
    nextPoll,
    signTrade,
    simulateTrade,
    solscanAccount,
    type TransactionPhase,
  } from "../../lib/transactions";
  import type { TradeResult } from "../../lib/types";
  import { wallet } from "../../lib/wallet.svelte";

  let mode = $state<"upload" | "uri">("upload");
  let name = $state("");
  let symbol = $state("");
  let description = $state("");
  let website = $state("");
  let twitter = $state("");
  let telegram = $state("");
  let image = $state("");
  let imagePreview = $state("");
  let metadataUri = $state("");
  let pinnedKey = $state("");
  let devBuy = $state("0");
  let slippage = $state("10");
  let priorityFee = $state("0.0001");
  let pinning = $state(false);
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

  const metadataKey = $derived(JSON.stringify([name, symbol, description, website, twitter, telegram, image]));
  const launchKey = $derived(JSON.stringify([mode, name, symbol, metadataUri, devBuy, slippage, priorityFee, wallet.account?.address]));
  const stale = $derived(Boolean(preview && previewKey !== launchKey));
  const pinStale = $derived(Boolean(pinnedKey && pinnedKey !== metadataKey));

  function details() {
    return { name: name.trim(), symbol: symbol.trim(), description, website: website.trim(), twitter: twitter.trim(), telegram: telegram.trim() };
  }

  async function artworkChanged(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    error = "";
    try {
      image = await fileToDataUrl(file);
      imagePreview = image;
      metadataUri = "";
      pinnedKey = "";
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
    }
  }

  async function pin() {
    error = "";
    pinning = true;
    const requestKey = metadataKey;
    const started = Date.now();
    const event = activity.start("Pin token metadata");
    try {
      const result = await pinMetadata(session.token, { ...details(), image });
      metadataUri = result.uri;
      imagePreview = result.image;
      pinnedKey = requestKey;
      activity.finish(event, "success", Date.now() - started);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      activity.finish(event, "error", Date.now() - started);
    } finally {
      pinning = false;
    }
  }

  function body(): Record<string, unknown> {
    if (!wallet.account) throw new Error("Connect a wallet first.");
    validateMetadata(details());
    validateMetadataUri(metadataUri.trim());
    if (mode === "upload" && (!pinnedKey || pinStale)) throw new Error("Pin the current token details and artwork before building the launch.");
    const amount = Number(devBuy);
    const numericSlippage = Number(slippage);
    const numericPriorityFee = Number(priorityFee);
    if (!Number.isFinite(amount) || amount < 0) throw new Error("Developer buy must be zero or more SOL.");
    if (amount > 0 && !session.health?.devBuyInCreate) throw new Error("This deployment has no lookup table for create + dev buy. Configure LOOKUP_TABLES or use a zero developer buy.");
    if (!Number.isFinite(numericSlippage) || numericSlippage < 0 || numericSlippage >= 100) throw new Error("Slippage must be from 0 through 99 percent.");
    if (!Number.isFinite(numericPriorityFee) || numericPriorityFee < 0 || numericPriorityFee > 0.1) throw new Error("Priority fee must be from 0 through 0.1 SOL.");
    return {
      publicKey: wallet.account.address,
      action: "create",
      amount,
      denominatedInSol: true,
      slippage: numericSlippage,
      priorityFee: numericPriorityFee,
      pool: "pump",
      tokenMetadata: { name: name.trim(), symbol: symbol.trim(), uri: metadataUri.trim() },
    };
  }

  async function build() {
    error = "";
    simulationError = "";
    let request: Record<string, unknown>;
    try { request = body(); } catch (cause) { error = cause instanceof Error ? cause.message : String(cause); return; }
    const requestKey = launchKey;
    const id = ++runId;
    building = true;
    preview = null;
    signature = "";
    simulated = false;
    logs = [];
    phase = "preview";
    const started = Date.now();
    const event = activity.start("Build token launch");
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
      if (result.err) simulationError = JSON.stringify(result.err, null, 2);
      else { simulated = true; phase = "simulated"; }
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
      const event = activity.start("Submit token launch", preview.mint);
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

  function inspectLaunch() {
    if (!preview) return;
    session.selectedMint = preview.mint;
    navigate("/app/coins");
  }

  onDestroy(() => { runId++; });
</script>

<div class="launch-layout">
  <section class="launch-form">
    <span class="kicker">token launch</span><h2>Metadata first. Launch second.</h2>
    <p class="intro">Pinning and transaction building are separate actions. The server-generated mint signs once; your wallet signs as creator and payer.</p>
    <div class="steps"><span class:active={!metadataUri}>01 Details</span><span class:active={metadataUri && !preview}>02 Metadata</span><span class:active={Boolean(preview)}>03 Launch</span></div>
    <div class="tabs"><button class:active={mode === "upload"} onclick={() => { mode = "upload"; metadataUri = ""; }}>Upload artwork</button><button class:active={mode === "uri"} onclick={() => { mode = "uri"; metadataUri = ""; }}>Existing metadata URI</button></div>
    <div class="fields">
      <div class="split"><label>Name<input bind:value={name} maxlength="32" placeholder="Example coin" /></label><label>Symbol<input bind:value={symbol} maxlength="10" placeholder="EXAMPLE" /></label></div>
      <label>Description<textarea bind:value={description} maxlength="1000" rows="3" placeholder="What is this coin?"></textarea></label>
      {#if mode === "upload"}
        <label>Artwork <span>PNG, JPEG, GIF, or WebP · 2 MB max</span><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onchange={artworkChanged} /></label>
        {#if imagePreview}<img class="artwork" src={imagePreview} alt="Token artwork preview" />{/if}
        <button class="secondary" disabled={pinning || !image || !name || !symbol || session.health?.metadataUpload === false} onclick={pin}>{pinning ? "Pinning image and JSON…" : metadataUri && !pinStale ? "Metadata pinned" : "Pin metadata to IPFS"}</button>
        {#if session.health?.metadataUpload === false}<p class="warning">PINATA_JWT is not configured. Use an existing metadata URI instead.</p>{/if}
      {:else}
        <label>Metadata URI<input bind:value={metadataUri} placeholder="ipfs://… or https://…" spellcheck="false" /></label>
      {/if}
      {#if metadataUri}<div class="uri"><span>metadata URI</span><code>{metadataUri}</code>{#if pinStale}<p class="warning">Details changed. Pin again before building.</p>{/if}</div>{/if}
      <div class="split"><label>Website<input bind:value={website} placeholder="https://…" /></label><label>X / Twitter<input bind:value={twitter} placeholder="https://x.com/…" /></label></div>
      <label>Telegram<input bind:value={telegram} placeholder="https://t.me/…" /></label>
      <div class="split"><label>Developer buy SOL<input bind:value={devBuy} inputmode="decimal" /></label><label>Slippage %<input bind:value={slippage} inputmode="decimal" /></label></div>
      <label>Priority fee SOL<input bind:value={priorityFee} inputmode="decimal" /></label>
      <label>Creator wallet<input value={wallet.account?.address ?? ""} readonly placeholder="Connect a wallet above" /></label>
    </div>
    {#if Number(devBuy) > 0 && !session.health?.devBuyInCreate}<p class="warning">A nonzero developer buy needs LOOKUP_TABLES. Set it on the Worker or use 0.</p>{/if}
    {#if stale}<p class="warning">Launch inputs changed. Build a fresh preview.</p>{/if}
    {#if error && !preview}<p class="error" role="alert">{error}</p>{/if}
    <button class="primary" disabled={building || submitting || !wallet.account || !metadataUri || session.health?.rpc === false} onclick={build}>{building ? "Building create transaction…" : "Build launch preview"}</button>
    <p class="note">Pinning is permanent even if you do not launch. Simulation does not guarantee inclusion.</p>
  </section>

  <div>
    <TransactionPreview {preview} {stale} {simulating} {simulated} {simulationError} {logs} {submitting} {phase} {signature} {error} onSimulate={() => void simulate()} onSubmit={() => void submit()} />
    {#if !preview}<section class="empty"><span>awaiting launch preview</span><p>The new mint address, create quote, signers, and transaction status will appear here.</p></section>{/if}
    {#if preview && ["confirmed", "finalized"].includes(phase)}
      <section class="launched"><span>token launched</span><code>{preview.mint}</code><div><button onclick={inspectLaunch}>Inspect coin</button><a href={solscanAccount(preview.mint, session.health?.cluster ?? "mainnet-beta")} target="_blank" rel="noopener">Mint on Solscan</a></div></section>
    {/if}
  </div>
</div>

<style>
  .launch-layout { display: grid; grid-template-columns: minmax(330px,.95fr) minmax(360px,1.05fr); gap: 14px; align-items: start; }
  .launch-form, .empty, .launched { padding: 20px; border: 1px solid var(--b); border-radius: 9px; background: var(--s1); }
  .kicker { color: var(--ac); font: 10px var(--mono); text-transform: uppercase; letter-spacing: .1em; }
  h2 { margin: 6px 0 8px; font-size: 22px; letter-spacing: -.025em; }
  .intro { color: var(--t2); font-size: 12px; line-height: 1.55; }
  .steps { display: flex; gap: 16px; margin: 18px 0; color: var(--t3); font: 9px var(--mono); text-transform: uppercase; }
  .steps .active { color: var(--ac); }
  .tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 16px; padding: 4px; background: var(--bg); border-radius: 7px; }
  .tabs button { padding: 8px; border-radius: 5px; color: var(--t3); font-size: 11px; }
  .tabs button.active { background: var(--s2); color: var(--ac); }
  .fields { display: grid; gap: 11px; }
  label { display: grid; gap: 6px; color: var(--t2); font: 10px var(--mono); }
  label > span { color: var(--t3); }
  input, textarea { box-sizing: border-box; width: 100%; padding: 10px; border: 1px solid var(--b); border-radius: 6px; background: var(--bg); color: var(--t); font: 12px var(--mono); }
  input[readonly] { color: var(--t3); }
  input[type="file"] { padding: 8px; color: var(--t3); }
  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .split > label:only-child { display: none; }
  .artwork { width: 72px; height: 72px; object-fit: cover; border: 1px solid var(--b); border-radius: 8px; }
  button { font-size: 12px; }
  .secondary { padding: 9px 12px; border: 1px solid var(--b2); border-radius: 6px; color: var(--t); background: var(--s2); }
  .secondary:disabled, .primary:disabled { opacity: .45; cursor: not-allowed; }
  .primary { width: 100%; margin-top: 18px; padding: 11px; border-radius: 6px; background: var(--ac); color: var(--ac-ink); font-weight: 650; }
  .uri { padding: 10px; border: 1px solid var(--b); border-radius: 6px; background: var(--bg); }
  .uri span { display: block; margin-bottom: 5px; color: var(--ac); font: 9px var(--mono); text-transform: uppercase; }
  .uri code { display: block; color: var(--t3); font-size: 9px; overflow-wrap: anywhere; }
  .warning, .error, .note { color: var(--warn); font-size: 11px; line-height: 1.5; }
  .error { color: var(--err); } .note { color: var(--t3); }
  .empty { padding: 50px 20px; text-align: center; color: var(--t3); }
  .empty span, .launched > span { font: 10px var(--mono); text-transform: uppercase; letter-spacing: .1em; }
  .empty p { font-size: 12px; }
  .launched { margin-top: 14px; color: var(--ac); }
  .launched code { display: block; margin: 10px 0; color: var(--t2); overflow-wrap: anywhere; font-size: 11px; }
  .launched div { display: flex; gap: 16px; align-items: center; }
  .launched button, .launched a { padding: 0; color: var(--ac); font-size: 12px; }
  @media (max-width: 950px) { .launch-layout { grid-template-columns: 1fr; } }
  @media (max-width: 600px) { .launch-form { padding: 15px; } input, textarea { font-size: 16px; } }
</style>
