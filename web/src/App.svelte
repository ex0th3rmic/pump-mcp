<script lang="ts">
  import Connect from "./components/Connect.svelte";
  import Compare from "./components/Compare.svelte";
  import Curve from "./components/Curve.svelte";
  import Flow from "./components/Flow.svelte";
  import Examples from "./components/Examples.svelte";
  import Playground from "./components/Playground.svelte";
  import { codeFor, examples } from "./lib/examples";
  import type { Health, Showcase } from "./lib/types";

  const origin = location.origin;
  const mcpUrl = `${origin}/mcp`;

  const REPO = "https://github.com/ex0th3rmic/pump-mcp";
  const X = "https://x.com/ex0therm";
  let stars = $state<number | null>(null);
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
    fetch("https://api.github.com/repos/ex0th3rmic/pump-mcp", { headers: { accept: "application/vnd.github+json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { stargazers_count?: number } | null) => {
        if (j && typeof j.stargazers_count === "number") stars = j.stargazers_count;
      })
      .catch(() => {});
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
    <nav class="status" aria-label="Project links">
      <a class="gh" href={REPO} target="_blank" rel="noopener">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
        GitHub{#if stars !== null}<span class="stars">★ {stars}</span>{/if}
      </a>
      <a href="{REPO}/issues/new/choose" target="_blank" rel="noopener">open an issue</a>
      <a class="x" href={X} target="_blank" rel="noopener" aria-label="ex0therm on X">
        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        @ex0therm
      </a>
      {#if healthFailed}<span class="bad">server unreachable</span>{:else if health}<span class="dim">v{health.version}</span>{/if}
    </nav>
  </header>

  <section class="hero">
    <div>
      <h1>pump.fun for AI agents.<br />One endpoint.</h1>
      <p class="tag">
        A self-hosted MCP server that gives any agent live bonding-curve data, buy and sell quotes, on-chain intel, unsigned trade building, and the official pump.fun API once the key is in. Many lookups per call, so a decision costs one round trip.
      </p>
      <a class="cm" href="#why" aria-label="Why Code Mode">
        <span class="new">new</span>
        <span>Built on <b>Cloudflare Code Mode</b>, the newest way to run MCP: the agent writes code, a sandbox runs it, one round trip.</span>
      </a>
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

  <h2 class="sec" id="why"><span class="n">02</span> why Code Mode</h2>
  <p class="lead why-lead">
    Most MCP servers give the model one tool per endpoint, so a question that needs eight lookups costs eight round trips and every result flows through the model.
    <a href="https://developers.cloudflare.com/agents/tools/codemode/" target="_blank" rel="noopener">Cloudflare's Code Mode</a> turns that around: the model writes a few lines of JavaScript, a throwaway sandbox runs them, and only the answer comes back. Same question, both ways:
  </p>
  <Compare />
  <p class="lead after">Models write code far more reliably than they juggle dozens of tool definitions, the keys never leave this Worker, and the whole API surface fits without squeezing it into a tool list. The <a href="https://github.com/ex0th3rmic/pump-mcp#why-code-mode" target="_blank" rel="noopener">README</a> has the full case with sources.</p>

  <h2 class="sec"><span class="n">03</span> things you can ask</h2>
  <p class="lead">Each card is a question for your agent and the code it would write. Click one to load it into the playground below.</p>
  <Examples mint={showcase?.mint ?? null} hasKey={health?.officialKey ?? false} onpick={pick} />

  <h2 class="sec"><span class="n">04</span> how it works</h2>
  <div class="flow"><Flow /></div>
  <div class="steps">
    <div class="step"><b><i>①</i>search</b>The agent asks what's possible and gets matching routes from one merged OpenAPI spec: official API, curve, RPC, trading.</div>
    <div class="step"><b><i>②</i>execute</b>It writes a few lines of JavaScript. The code runs in a sandboxed Worker with no network access of its own.</div>
    <div class="step"><b><i>③</i>host fetches</b>Every request returns to this Worker, which attaches the keys and calls Solana, PumpPortal or pump.fun. Keys never enter the sandbox.</div>
  </div>

  <h2 class="sec" bind:this={playground} id="try"><span class="n">05</span> try it</h2>
  <Playground bind:code authOn={health?.auth ?? true} />

  <h2 class="sec">for agents</h2>
  <p class="agents">
    <a href="/llms.txt">GET /llms.txt</a> · <a href="/openapi.json">GET /openapi.json</a> · <a href="/health">GET /health</a> · POST /mcp
  </p>

  <footer class="foot">
    <div class="links">
      <div>
        <span class="k">source</span>
        <a href="https://github.com/ex0th3rmic/pump-mcp" target="_blank" rel="noopener">github.com/ex0th3rmic/pump-mcp</a> · MIT · self-host it on your own Cloudflare account ·
        <a href={X} target="_blank" rel="noopener">@ex0therm on X</a>
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
    <div class="cta">
      Questions? <a href="{REPO}/issues/new?template=question.yml" target="_blank" rel="noopener">Open an issue</a>, it will get answered and usually turn into a doc fix.
      Want to add a route, a client snippet or an example? <a href="{REPO}/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">CONTRIBUTING.md</a> has the setup and the ground rules.
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
  .status { display: flex; gap: 14px; align-items: center; }
  .status a { text-decoration: none; color: var(--t2); display: inline-flex; align-items: center; gap: 6px; }
  .status a:hover { color: var(--t); }
  .status .stars { color: var(--ac); margin-left: 2px; }
  .status .dim { color: var(--t3); }
  .bad { color: var(--err); }

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
  .why-lead { margin: -4px 0 14px; max-width: 80ch; line-height: 1.55; }
  .lead.after { margin-top: 14px; max-width: 80ch; line-height: 1.55; }
  .cm {
    display: flex; gap: 10px; align-items: flex-start;
    background: var(--ac-bg); border: 1px solid rgba(25, 195, 125, 0.35); border-radius: 8px;
    padding: 10px 12px; margin: 0 0 18px; font-size: 13px; color: var(--t2); line-height: 1.45; text-decoration: none; max-width: 46ch;
  }
  .cm:hover { border-color: var(--ac); }
  .cm b { color: var(--t); font-weight: 600; }
  .cm .new { font-family: var(--mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ac-ink); background: var(--ac); border-radius: 4px; padding: 2px 6px; margin-top: 2px; font-weight: 700; }
  .flow { margin-bottom: 10px; }

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
  .cta { font-family: var(--sans); font-size: 13px; color: var(--t2); line-height: 1.55; max-width: 80ch; }
  .cta a { color: var(--t); }
  .fine { display: flex; gap: 18px; flex-wrap: wrap; }

  @media (max-width: 700px) {
    .flow { display: none; }
  }
  @media (min-width: 701px) {
    .steps { grid-template-columns: repeat(3, 1fr); }
  }
  @media (max-width: 760px) {
    main { padding-top: max(20px, env(safe-area-inset-top)); padding-bottom: max(40px, env(safe-area-inset-bottom)); }
    .top { margin-bottom: 26px; }
    .hero { grid-template-columns: 1fr; gap: 22px; }
    h1 { font-size: 34px; }
    .tag { font-size: 15.5px; }
    .cm { max-width: none; }
    .steps { grid-template-columns: 1fr; }
    .foot { gap: 10px 14px; }
    .links .k { display: block; min-width: 0; margin-bottom: 2px; }
  }
  @media (max-width: 420px) {
    .feat { grid-template-columns: 1fr; }
    .top .status { font-size: 11px; gap: 10px; }
    .top .status .dim { display: none; }
  }
</style>
