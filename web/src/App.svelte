<script lang="ts">
  import Connect from "./components/Connect.svelte";
  import Curve from "./components/Curve.svelte";
  import Examples from "./components/Examples.svelte";
  import Playground from "./components/Playground.svelte";
  import { codeFor, examples } from "./lib/examples";
  import type { Health, Showcase } from "./lib/types";

  const origin = location.origin;
  const mcpUrl = `${origin}/mcp`;

  let health = $state<Health | null>(null);
  let healthFailed = $state(false);
  let showcase = $state<Showcase | null>(null);
  let showcaseState = $state<"loading" | "live" | "sample">("loading");
  let code = $state(codeFor(examples.find((e) => e.id === "mode")!, null));
  let playground: HTMLElement | undefined = $state();

  $effect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then((h: Health) => (health = h))
      .catch(() => (healthFailed = true));
    fetch("/api/showcase")
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        showcase = (await r.json()) as Showcase;
        showcaseState = "live";
        code = codeFor(examples.find((e) => e.id === "mode")!, showcase.mint);
      })
      .catch(() => (showcaseState = "sample"));
  });

  function pick(c: string) {
    code = c;
    playground?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const features = $derived([
    { label: "curve & quotes", on: health?.rpc ?? false, off: "curve & quotes · RPC_URL not set" },
    { label: "Solana RPC", on: health?.rpc ?? false, off: "Solana RPC · RPC_URL not set" },
    { label: "unsigned trades", on: true, off: "" },
    { label: "sandboxed execution", on: true, off: "" },
    { label: "social API", on: health?.officialKey ?? false, off: "social API · key pending" },
    { label: "lightning trades", on: health?.lightning ?? false, off: "lightning trades · off" },
  ]);
</script>

<div class="grid-bg" aria-hidden="true"></div>

<main class="wrap">
  <header class="top">
    <b>pump-mcp</b>
    <span class="status">
      {#if health}
        <span class="ok">operational</span> · v{health.version} · <a href="/health">/health</a>
      {:else if healthFailed}
        <span class="bad">unreachable</span> · <a href="/health">/health</a>
      {:else}
        checking…
      {/if}
    </span>
  </header>

  <section class="hero">
    <div>
      <h1>pump.fun for AI agents.<br />One endpoint.</h1>
      <p class="tag">
        A self-hosted MCP server that gives any agent live bonding-curve data, buy and sell quotes, on-chain intel, unsigned trade building, and the official pump.fun API once the key is in. Many lookups per call, so a decision costs one round trip.
      </p>
      <ul class="feat">
        {#each features as f}
          <li class:pend={!f.on}>{f.on ? f.label : f.off}</li>
        {/each}
      </ul>
    </div>
    <Curve {showcase} state={showcaseState} />
  </section>

  <h2 class="sec"><span class="n">01</span> connect</h2>
  <Connect {mcpUrl} />

  <h2 class="sec"><span class="n">02</span> things you can ask</h2>
  <p class="lead">Each card is a question for your agent and the code it would write. Click one to load it into the playground below.</p>
  <Examples mint={showcase?.mint ?? null} hasKey={health?.officialKey ?? false} onpick={pick} />

  <h2 class="sec"><span class="n">03</span> how it works</h2>
  <div class="steps">
    <div class="step"><b><i>①</i>search</b>The agent asks what's possible and gets matching routes from one merged OpenAPI spec: official API, curve, RPC, trading.</div>
    <div class="step"><b><i>②</i>execute</b>It writes a few lines of JavaScript. The code runs in a sandboxed Worker with no network access of its own.</div>
    <div class="step"><b><i>③</i>host fetches</b>Every request returns to this Worker, which attaches the keys and calls Solana, PumpPortal or pump.fun. Keys never enter the sandbox.</div>
  </div>
  <p class="why">
    <b>Why code instead of one tool per route?</b> Models write JavaScript far more reliably than they juggle dozens of tool definitions, and code can loop, filter and join without each intermediate result passing through the model. A question that needs eight lookups becomes one round trip, the model reads only the answer, and the keys never leave this Worker. This is
    <a href="https://developers.cloudflare.com/agents/tools/codemode/" target="_blank" rel="noopener">Cloudflare's Code Mode</a>; the <a href="https://github.com/ex0th3rmic/pump-mcp#why-code-mode" target="_blank" rel="noopener">README</a> has the longer case.
  </p>

  <h2 class="sec" bind:this={playground} id="try"><span class="n">04</span> try it</h2>
  <Playground bind:code authOn={health?.auth ?? true} />

  <h2 class="sec">for agents</h2>
  <p class="agents">
    <a href="/llms.txt">GET /llms.txt</a> · <a href="/openapi.json">GET /openapi.json</a> · <a href="/health">GET /health</a> · POST /mcp
  </p>

  <footer class="foot">
    <div class="links">
      <div>
        <span class="k">source</span>
        <a href="https://github.com/ex0th3rmic/pump-mcp" target="_blank" rel="noopener">github.com/ex0th3rmic/pump-mcp</a> · MIT · self-host it on your own Cloudflare account
      </div>
      <div>
        <span class="k">pump.fun</span>
        <a href="https://docs.pump.fun" target="_blank" rel="noopener">docs.pump.fun</a> ·
        <a href="https://developers.pump.fun" target="_blank" rel="noopener">developers.pump.fun</a> (apply for an API key) ·
        <a href="https://docs.pump.fun/terms/" target="_blank" rel="noopener">API terms</a> ·
        <a href="https://mcp.pump.fun/mcp" target="_blank" rel="noopener">pump.fun's own MCP server</a>
      </div>
      <div>
        <span class="k">built on</span>
        <a href="https://developers.cloudflare.com/agents/tools/codemode/" target="_blank" rel="noopener">Cloudflare Code Mode</a> ·
        <a href="https://modelcontextprotocol.io" target="_blank" rel="noopener">Model Context Protocol</a> ·
        <a href="https://pumpportal.fun" target="_blank" rel="noopener">PumpPortal</a> (trade building) ·
        <a href="https://www.helius.dev" target="_blank" rel="noopener">Helius</a> (RPC)
      </div>
    </div>
    <div class="fine">
      <span>Data from pump.fun</span><span>Trades are unsigned until your wallet signs.</span><span>Not affiliated with pump.fun.</span><span>Not financial advice.</span>
    </div>
  </footer>
</main>

<style>
  .grid-bg {
    position: fixed;
    inset: 0;
    pointer-events: none;
    background-image: linear-gradient(var(--b) 1px, transparent 1px), linear-gradient(90deg, var(--b) 1px, transparent 1px);
    background-size: 32px 32px;
    opacity: 0.25;
    mask-image: linear-gradient(180deg, #000 0%, transparent 60vh);
    -webkit-mask-image: linear-gradient(180deg, #000 0%, transparent 60vh);
    z-index: 0;
  }
  main { position: relative; z-index: 1; padding-top: 40px; padding-bottom: 48px; }

  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--t3);
    margin-bottom: 40px;
  }
  .top b { color: var(--t); font-weight: 600; }
  .ok { color: var(--ac); }
  .ok::before {
    content: "";
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--ac);
    margin-right: 7px;
    vertical-align: 1px;
    animation: pulse 2s infinite;
  }
  .bad { color: var(--err); }
  @keyframes pulse {
    0% { box-shadow: 0 0 0 0 var(--ac-bg); }
    70% { box-shadow: 0 0 0 6px transparent; }
    100% { box-shadow: 0 0 0 0 transparent; }
  }

  .hero { display: grid; grid-template-columns: 1.15fr 1fr; gap: 36px; align-items: start; }
  h1 { font-size: 38px; margin: 0 0 12px; letter-spacing: -0.03em; font-weight: 700; line-height: 1.08; color: #fff; }
  .tag { color: var(--t2); font-size: 16px; margin: 0 0 20px; line-height: 1.55; max-width: 46ch; }
  .feat { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 6px 18px; font-family: var(--mono); font-size: 12px; color: var(--t2); }
  .feat li::before { content: "✓ "; color: var(--ac); }
  .feat li.pend { color: var(--t3); }
  .feat li.pend::before { content: "○ "; color: var(--warn); }

  .lead { font-size: 13px; color: var(--t2); margin: -4px 0 0; }

  .steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .step { background: var(--s1); border: 1px solid var(--b); border-radius: 8px; padding: 16px; font-size: 13px; color: var(--t2); line-height: 1.5; }
  .step b { display: block; color: #fff; margin-bottom: 6px; font-size: 14px; font-family: var(--mono); font-weight: 600; }
  .step i { color: var(--ac); font-style: normal; margin-right: 8px; }
  .why { font-size: 13px; color: var(--t2); line-height: 1.55; margin: 14px 0 0; max-width: 78ch; }
  .why b { color: var(--t); font-weight: 600; }

  .agents { font-family: var(--mono); font-size: 13px; color: var(--t2); margin: 0; }
  .foot {
    color: var(--t3);
    font-family: var(--mono);
    font-size: 12px;
    margin-top: 48px;
    padding-top: 18px;
    border-top: 1px solid var(--b);
    display: grid;
    gap: 16px;
  }
  .links { display: grid; gap: 8px; line-height: 1.7; }
  .links .k { color: var(--t2); display: inline-block; min-width: 72px; }
  .links a { color: var(--t2); }
  .links a:hover { color: var(--t); }
  .fine { display: flex; gap: 18px; flex-wrap: wrap; }

  @media (max-width: 760px) {
    main { padding-top: 24px; }
    .top { margin-bottom: 28px; }
    .hero { grid-template-columns: 1fr; gap: 24px; }
    h1 { font-size: 32px; }
    .steps { grid-template-columns: 1fr; }
  }
</style>
