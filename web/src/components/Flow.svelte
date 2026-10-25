<script lang="ts">
  /** How one call flows, animated on a 5-second loop. Shown at desktop widths; the step cards cover mobile. */
  const motion = typeof matchMedia === "function" ? !matchMedia("(prefers-reduced-motion: reduce)").matches : true;
  const LOOP = 5;
  const travel = (s: number, e: number) => ({ a: (s / LOOP).toFixed(3), b: (e / LOOP).toFixed(3) });
  const hops: Array<{ path: string; s: number; e: number }> = [
    { path: "M180,60 L300,60", s: 0, e: 0.5 }, // agent → host
    { path: "M420,96 L420,120", s: 0.6, e: 0.85 }, // host → sandbox (code)
    { path: "M440,120 L440,96", s: 1.0, e: 1.25 }, // sandbox → host (codemode.request)
    { path: "M540,60 L640,60", s: 1.35, e: 1.75 }, // host → upstream
    { path: "M640,80 L540,80", s: 1.85, e: 2.25 }, // upstream → host
    { path: "M420,96 L420,120", s: 2.35, e: 2.6 }, // host → sandbox (response)
    { path: "M440,120 L440,96", s: 2.75, e: 3.0 }, // sandbox → host (result)
    { path: "M300,80 L180,80", s: 3.1, e: 3.6 }, // host → agent (answer)
  ];
</script>

<svg viewBox="0 0 920 200" role="img" aria-label="How a call flows: agent to host Worker, host to sandbox and back, host to upstreams and back, answer to the agent">
  <!-- agent -->
  <rect x="20" y="30" width="160" height="80" rx="8" class="box" />
  <text x="100" y="62" class="h" text-anchor="middle">AI agent</text>
  <text x="100" y="82" class="m" text-anchor="middle">search · execute</text>

  <!-- host -->
  <rect x="300" y="24" width="240" height="72" rx="8" class="box ac" />
  <text x="420" y="52" class="h" text-anchor="middle">host Worker</text>
  <text x="420" y="72" class="m" text-anchor="middle">auth · route table · the keys</text>

  <!-- sandbox -->
  <rect x="300" y="120" width="240" height="56" rx="8" class="box sand" />
  <text x="420" y="144" class="h" text-anchor="middle">Dynamic Worker sandbox</text>
  <text x="420" y="162" class="m warn" text-anchor="middle">no network · fetch() throws</text>

  <!-- upstreams -->
  <rect x="640" y="20" width="260" height="160" rx="8" class="box" />
  <text x="660" y="52" class="h">Solana RPC</text>
  <text x="660" y="70" class="m">/curve · /rpc · /trade state</text>
  <text x="660" y="104" class="h">IPFS</text>
  <text x="660" y="122" class="m">/metadata · new coins</text>
  <text x="660" y="156" class="h">pump.fun Developer API</text>
  <text x="660" y="174" class="m">official routes · needs key</text>

  <!-- wires -->
  <line x1="180" y1="60" x2="300" y2="60" class="wire" />
  <text x="240" y="52" class="t" text-anchor="middle">POST /mcp</text>
  <line x1="300" y1="80" x2="180" y2="80" class="wire" />
  <text x="240" y="96" class="t" text-anchor="middle">one answer</text>
  <line x1="420" y1="96" x2="420" y2="120" class="wire" />
  <line x1="440" y1="120" x2="440" y2="96" class="wire" />
  <text x="452" y="112" class="t">codemode.request()</text>
  <line x1="540" y1="60" x2="640" y2="60" class="wire" />
  <text x="590" y="52" class="t" text-anchor="middle">+ secrets</text>
  <line x1="640" y1="80" x2="540" y2="80" class="wire" />

  {#each hops as h}
    {@const t = travel(h.s, h.e)}
    <circle r="4" fill="var(--ac)" opacity={motion ? 0 : 1}>
      {#if motion}
        <animateMotion path={h.path} dur="{LOOP}s" repeatCount="indefinite" calcMode="linear" keyPoints="0;0;1;1" keyTimes="0;{t.a};{t.b};1" />
        <animate attributeName="opacity" dur="{LOOP}s" repeatCount="indefinite" calcMode="discrete" values="0;1;0" keyTimes="0;{t.a};{t.b}" />
      {/if}
    </circle>
  {/each}
</svg>

<style>
  svg { width: 100%; height: auto; display: block; background: var(--s1); border: 1px solid var(--b); border-radius: 8px; padding: 8px; }
  .box { fill: var(--bg); stroke: var(--b2); }
  .box.ac { stroke: var(--ac); }
  .box.sand { stroke: var(--ac); stroke-dasharray: 4 3; }
  .h { fill: var(--t); font-family: var(--mono); font-size: 13px; font-weight: 600; }
  .m { fill: var(--t3); font-family: var(--mono); font-size: 11px; }
  .m.warn { fill: var(--warn); }
  .t { fill: var(--t3); font-family: var(--mono); font-size: 10px; }
  .wire { stroke: var(--b2); stroke-width: 1; }
</style>
