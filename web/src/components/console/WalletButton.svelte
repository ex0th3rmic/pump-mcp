<script lang="ts">
  import { shortAddress, wallet } from "../../lib/wallet.svelte";

  let open = $state(false);
  let choice = $state("");

  async function connect() {
    try {
      await wallet.connect(choice);
      open = false;
    } catch {
      // The shared wallet state presents the error.
    }
  }
</script>

<div class="wallet-control">
  {#if wallet.account}
    <button class="connected" onclick={() => void wallet.disconnect().catch(() => {})} title="Disconnect wallet">
      <i></i>{shortAddress(wallet.account.address)}
    </button>
  {:else}
    <button class="connect" onclick={() => (open = !open)}>Connect wallet</button>
  {/if}
  {#if open && !wallet.account}
    <div class="popover">
      <b>Wallet Standard</b>
      <p>Signing stays in your wallet. No keys are sent to this app.</p>
      {#if wallet.available.length}
        <label for="wallet-choice">Injected wallet</label>
        <select id="wallet-choice" bind:value={choice}>
          <option value="">Choose wallet</option>
          {#each wallet.available as item}<option value={item.name}>{item.name}</option>{/each}
        </select>
        <button class="connect wide" disabled={!choice || wallet.connecting} onclick={connect}>{wallet.connecting ? "Connecting…" : "Connect"}</button>
      {:else}
        <span class="empty">No compatible injected wallet found. Install or enable a Wallet Standard-compatible Solana wallet, then reopen this dialog.</span>
      {/if}
      {#if wallet.error}<span class="error">{wallet.error}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .wallet-control { position: relative; }
  button { font-size: 12px; }
  .connect, .connected { padding: 8px 12px; border-radius: 6px; }
  .connect { background: var(--ac); color: var(--ac-ink); font-weight: 650; }
  .connect:disabled { opacity: .5; }
  .connected { display: flex; align-items: center; gap: 7px; border: 1px solid var(--b); background: var(--s1); color: var(--t2); font-family: var(--mono); }
  .connected i { width: 6px; height: 6px; border-radius: 50%; background: var(--ac); }
  .popover { position: absolute; z-index: 20; right: 0; top: calc(100% + 8px); width: 300px; padding: 16px; border: 1px solid var(--b2); border-radius: 8px; background: var(--s2); box-shadow: 0 18px 50px rgba(0,0,0,.35); }
  .popover b { font-size: 13px; }
  .popover p { color: var(--t2); font-size: 12px; line-height: 1.5; }
  label { display: block; margin-bottom: 6px; color: var(--t3); font: 10px var(--mono); }
  select { width: 100%; margin-bottom: 10px; padding: 9px; border: 1px solid var(--b); border-radius: 5px; background: var(--bg); color: var(--t); }
  .wide { width: 100%; }
  .empty, .error { display: block; color: var(--t3); font-size: 12px; line-height: 1.5; }
  .error { margin-top: 10px; color: var(--err); }
</style>
