<script lang="ts">
  import Playground from "../Playground.svelte";
  import Activity from "./Activity.svelte";
  import ApiInspector from "./ApiInspector.svelte";
  import CoinExplorer from "./CoinExplorer.svelte";
  import DemoLaunch from "./DemoLaunch.svelte";
  import DemoTrade from "./DemoTrade.svelte";
  import LaunchWizard from "./LaunchWizard.svelte";
  import TradeBuilder from "./TradeBuilder.svelte";
  import WalletButton from "./WalletButton.svelte";
  import { activity } from "../../lib/activity.svelte";
  import { codeFor, examples } from "../../lib/examples";
  import { tokenHint } from "../../lib/mcp";
  import { navigate, route, viewFromPath } from "../../lib/router.svelte";
  import { session } from "../../lib/session.svelte";
  import { wallet } from "../../lib/wallet.svelte";

  const items = [
    { id: "playground", label: "Playground", index: "01" },
    { id: "coins", label: "Coins", index: "02" },
    { id: "trade", label: "Trade", index: "03" },
    { id: "launch", label: "Launch", index: "04" },
    { id: "api", label: "API", index: "05" },
    { id: "activity", label: "Activity", index: "06" },
  ] as const;

  let draft = $state("");
  let unlockError = $state("");
  let operatorOpen = $state(true);
  let code = $state(codeFor(examples.find((example) => example.id === "mode")!, null));
  const view = $derived(viewFromPath(route.path) ?? "coins");

  $effect(() => {
    if (!viewFromPath(route.path) && route.path !== "/app" && route.path !== "/app/") {
      navigate("/app/coins", true);
    }
  });

  async function unlock() {
    unlockError = "";
    const hint = tokenHint(draft.trim().replace(/^bearer\s+/i, ""));
    if (hint) {
      unlockError = hint;
      return;
    }
    try {
      await session.unlock(draft);
      draft = "";
      operatorOpen = false;
    } catch (error) {
      unlockError = error instanceof Error ? error.message : String(error);
    }
  }

  function lock() {
    void wallet.disconnect().catch(() => {});
    activity.clear();
    session.lock();
    unlockError = "";
  }
</script>

<div class="console">
  <aside class="sidebar">
    <a class="brand" href="/" aria-label="Pump MCP home">
      <span class="mark">p</span>
      <span><b>pump-mcp</b><small>operator console</small></span>
    </a>
    <div class="network"><i class:on={session.health?.rpc}></i>{session.health?.cluster ?? "connecting"}</div>
    <nav aria-label="Console">
      <span class="label">workspace</span>
      {#each items as item}
        <a
          href={`/app/${item.id}`}
          class:active={view === item.id}
          onclick={(event) => { event.preventDefault(); navigate(`/app/${item.id}`); }}
        >
          <span>{item.label}</span><small>{item.index}</small>
        </a>
      {/each}
    </nav>
    <div class="sidebar-foot">
      <span>{session.token ? "Session-only token" : "Public read-only demo"}</span>
      <small>{session.token ? "Keys stay in the host Worker. Wallet keys stay in your wallet." : "No account or token needed. Private execution stays protected."}</small>
      {#if session.token}<button onclick={lock}>Lock session</button>{/if}
    </div>
  </aside>

  <main class="main">
    <header class="topbar">
      <div>
        <span class="eyebrow">pump-mcp / {view}</span>
        <h1>{items.find((item) => item.id === view)?.label ?? "Console"}</h1>
      </div>
      <div class="actions">
        {#if session.token}
          <span class="session"><i></i>MCP session</span><WalletButton />
        {:else}
          <span class="demo-badge">read-only demo</span>
          <button class="operator-button" onclick={() => (operatorOpen = !operatorOpen)}>Operator unlock</button>
        {/if}
      </div>
    </header>

    {#if !session.token}
      <section class="demo-banner">
        <div><b>Explore Pump MCP—no token needed.</b><span>Live public showcase data and clearly labeled sample workflows.</span></div>
        <span>read only</span>
      </section>
      {#if operatorOpen}
        <section class="unlock">
          <div class="unlock-head"><span class="eyebrow">operator access</span><button onclick={() => (operatorOpen = false)}>Close</button></div>
          <h2>Unlock live operations.</h2>
          <p>Visitors can keep exploring the demo. Operators can enter the deployment-issued MCP bearer token to enable arbitrary curve reads, real execution, wallet signing, and launches.</p>
          <form onsubmit={(event) => { event.preventDefault(); void unlock(); }}>
            <label for="console-token">Bearer token</label>
            <input id="console-token" type="password" bind:value={draft} autocomplete="off" spellcheck="false" placeholder="MCP_BEARER_TOKEN" />
            <button class="primary" disabled={session.connecting || session.health?.auth === false}>
              {session.connecting ? "Connecting…" : "Unlock operator mode"}
            </button>
          </form>
          {#if session.health?.auth === false}<p class="error">This Worker needs MCP_BEARER_TOKEN before operator mode can be used.</p>{/if}
          {#if unlockError}<p class="error" role="alert">{unlockError}</p>{/if}
          <div class="unlock-notes"><span>No signup</span><span>This tab session only</span><span>Token cleared on lock</span></div>
        </section>
      {/if}
    {/if}

    {#if view === "playground"}
      <Playground bind:code authOn={session.health?.auth ?? true} showToken={false} demo={!session.token} />
    {:else if view === "coins"}
      <CoinExplorer />
    {:else if view === "trade"}
      {#if session.token}<TradeBuilder />{:else}<DemoTrade />{/if}
    {:else if view === "launch"}
      {#if session.token}<LaunchWizard />{:else}<DemoLaunch />{/if}
    {:else if view === "api"}
      <ApiInspector />
    {:else}
      <Activity />
    {/if}
  </main>
</div>

<style>
  .console { min-height: 100vh; display: grid; grid-template-columns: 220px minmax(0, 1fr); }
  .sidebar { position: sticky; top: 0; height: 100vh; box-sizing: border-box; padding: 24px 14px 18px; border-right: 1px solid var(--b); background: #0d0f13; display: flex; flex-direction: column; }
  .brand { display: flex; align-items: center; gap: 10px; text-decoration: none; padding: 0 8px; }
  .mark { display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid rgba(25,195,125,.4); background: var(--ac-bg); color: var(--ac); border-radius: 8px; font-family: var(--mono); font-weight: 700; }
  .brand b { display: block; font-size: 14px; }
  .brand small { display: block; color: var(--t3); font: 9px var(--mono); text-transform: uppercase; letter-spacing: .12em; }
  .network { margin: 24px 6px 28px; padding: 10px; border: 1px solid var(--b); border-radius: 6px; color: var(--t2); font: 11px var(--mono); display: flex; align-items: center; gap: 7px; }
  .network i, .session i { width: 6px; height: 6px; border-radius: 50%; background: var(--warn); }
  .network i.on, .session i { background: var(--ac); }
  nav { display: grid; gap: 4px; }
  .label, .eyebrow { color: var(--t3); font: 10px var(--mono); text-transform: uppercase; letter-spacing: .12em; }
  nav .label { padding: 0 10px 8px; }
  nav a { display: flex; justify-content: space-between; align-items: center; padding: 10px; color: var(--t2); text-decoration: none; border: 1px solid transparent; border-radius: 6px; font-size: 13px; }
  nav a small { color: var(--t3); font: 10px var(--mono); }
  nav a:hover { color: var(--t); background: var(--s1); }
  nav a.active { color: var(--ac); background: var(--ac-bg); border-color: rgba(25,195,125,.22); }
  .sidebar-foot { margin-top: auto; padding: 14px 8px 0; border-top: 1px solid var(--b); }
  .sidebar-foot span { color: var(--t2); font: 11px var(--mono); }
  .sidebar-foot small { display: block; margin: 6px 0 12px; color: var(--t3); font-size: 11px; line-height: 1.55; }
  .sidebar-foot button { color: var(--t2); font: 11px var(--mono); padding: 0; }
  .sidebar-foot button:hover { color: var(--t); }
  .main { min-width: 0; width: 100%; max-width: 1380px; padding: 28px 36px 56px; box-sizing: border-box; }
  .topbar { min-height: 68px; margin-bottom: 28px; display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; }
  h1 { margin: 5px 0 0; font-size: 26px; letter-spacing: -.03em; }
  .actions { display: flex; align-items: center; gap: 12px; }
  .session { display: flex; align-items: center; gap: 6px; color: var(--t3); font: 10px var(--mono); }
  .demo-badge { color: var(--warn); font: 10px var(--mono); }
  .operator-button { padding: 8px 12px; border: 1px solid var(--b2); border-radius: 6px; color: var(--t); background: var(--s1); font-size: 12px; }
  .operator-button:hover { border-color: var(--ac); }
  .demo-banner { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 14px; padding: 12px 16px; border: 1px solid rgba(25,195,125,.22); border-radius: 8px; background: var(--ac-bg); }
  .demo-banner b { display: block; color: var(--ac); font-size: 13px; }
  .demo-banner div span { display: block; margin-top: 3px; color: var(--t2); font-size: 11px; }
  .demo-banner > span { color: var(--ac); font: 9px var(--mono); text-transform: uppercase; white-space: nowrap; }
  .unlock { margin-bottom: 14px; padding: 24px; border: 1px solid var(--b2); border-radius: 10px; background: var(--s1); }
  .unlock-head { display: flex; justify-content: space-between; align-items: center; }
  .unlock-head button { padding: 0; color: var(--t3); font: 11px var(--mono); }
  .unlock h2 { margin: 8px 0 10px; font-size: 24px; letter-spacing: -.03em; }
  .unlock p { max-width: 80ch; color: var(--t2); line-height: 1.6; font-size: 13px; }
  form { display: grid; gap: 10px; margin-top: 20px; max-width: 560px; }
  label { color: var(--t2); font: 11px var(--mono); }
  input { width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid var(--b); border-radius: 6px; background: var(--bg); color: var(--t); font: 13px var(--mono); }
  .primary { padding: 11px 16px; border-radius: 6px; background: var(--ac); color: var(--ac-ink); font-weight: 650; }
  .primary:disabled { opacity: .5; cursor: not-allowed; }
  .error { color: var(--err) !important; font-size: 13px; }
  .unlock-notes { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 18px; color: var(--t3); font: 10px var(--mono); }
  @media (max-width: 800px) {
    .console { display: block; }
    .sidebar { position: static; width: 100%; height: auto; padding: 14px 18px; border-right: 0; border-bottom: 1px solid var(--b); }
    .brand { padding: 0; }
    .network, .label, .sidebar-foot { display: none; }
    nav { display: flex; gap: 4px; overflow-x: auto; margin-top: 14px; padding-bottom: 2px; }
    nav a { flex: 0 0 auto; padding: 7px 10px; }
    nav a small { display: none; }
    .main { padding: 22px 18px 40px; }
    .topbar { margin-bottom: 22px; }
    .actions { flex-wrap: wrap; justify-content: flex-end; }
    .session, .demo-badge { display: none; }
    .unlock { padding: 18px; }
  }
  @media (max-width: 480px) {
    .demo-banner { align-items: flex-start; }
    .demo-banner > span { display: none; }
    .operator-button { padding: 8px 9px; font-size: 11px; }
  }
</style>
