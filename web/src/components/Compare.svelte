<script lang="ts">
  /**
   * Side by side, animated: the same eight-lookup question as eight tool calls versus one Code Mode
   * execute. Dots travel on a shared 4-second loop; windows are fractions of that loop.
   */
  const motion = typeof matchMedia === "function" ? !matchMedia("(prefers-reduced-motion: reduce)").matches : true;
  const LOOP = 4;
  const rows = [0, 1, 2, 3, 4, 5, 6, 7];
  const rowY = (i: number) => 46 + i * 24;

  /** keyTimes for a dot that waits, travels between s and e seconds, then waits again. */
  const travel = (s: number, e: number) => ({ a: (s / LOOP).toFixed(3), b: (e / LOOP).toFixed(3) });

  const stats = [
    { n: "2", l: "tools exposed", s: "instead of 70+ definitions" },
    { n: "1", l: "round trip", s: "for a question that needs 8 lookups" },
    { n: "98.7%", l: "fewer tokens", s: "Anthropic's measurement, one multi-step task" },
    { n: "0", l: "network access", s: "in the sandbox; fetch() throws" },
  ];
</script>

{#snippet dot(path: string, s: number, e: number)}
  {@const t = travel(s, e)}
  <circle r="4" fill="var(--ac)" opacity={motion ? 0 : 1}>
    {#if motion}
      <animateMotion {path} dur="{LOOP}s" repeatCount="indefinite" calcMode="linear" keyPoints="0;0;1;1" keyTimes="0;{t.a};{t.b};1" />
      <animate attributeName="opacity" dur="{LOOP}s" repeatCount="indefinite" calcMode="discrete" values="0;1;0" keyTimes="0;{t.a};{t.b}" />
    {/if}
  </circle>
{/snippet}

<div class="cmp">
  <div class="panel old">
    <div class="ph"><span>one tool per route</span><span class="dim">the usual MCP server</span></div>
    <svg viewBox="0 0 440 250" role="img" aria-label="Eight sequential round trips between the model and the API">
      <rect x="16" y="20" width="104" height="210" rx="8" class="box" />
      <text x="68" y="130" class="lbl" text-anchor="middle">model</text>
      <rect x="320" y="20" width="104" height="210" rx="8" class="box" />
      <text x="372" y="122" class="lbl" text-anchor="middle">pump.fun</text>
      <text x="372" y="140" class="lbl dim" text-anchor="middle">+ chain</text>
      {#each rows as i}
        <line x1="120" y1={rowY(i)} x2="320" y2={rowY(i)} class="wire" />
        <text x="220" y={rowY(i) - 6} class="tiny" text-anchor="middle">tool call {i + 1}</text>
        {@render dot(`M120,${rowY(i)} L320,${rowY(i)}`, i * 0.5, i * 0.5 + 0.2)}
        {@render dot(`M320,${rowY(i)} L120,${rowY(i)}`, i * 0.5 + 0.25, i * 0.5 + 0.45)}
      {/each}
    </svg>
    <div class="pf"><b>8 model turns.</b> Every result is read back into context before the next call. The model does the comparison by hand.</div>
  </div>

  <div class="panel new">
    <div class="ph"><span>Code Mode</span><span class="ac">this server</span></div>
    <svg viewBox="0 0 440 250" role="img" aria-label="One execute call: the sandbox makes eight parallel requests and returns one answer">
      <rect x="16" y="20" width="84" height="210" rx="8" class="box" />
      <text x="58" y="130" class="lbl" text-anchor="middle">model</text>
      <rect x="176" y="20" width="104" height="210" rx="8" class="box sand" />
      <text x="228" y="122" class="lbl" text-anchor="middle">sandbox</text>
      <text x="228" y="140" class="tiny ac" text-anchor="middle">runs the code</text>
      <rect x="320" y="20" width="104" height="210" rx="8" class="box" />
      <text x="372" y="122" class="lbl" text-anchor="middle">pump.fun</text>
      <text x="372" y="140" class="lbl dim" text-anchor="middle">+ chain</text>

      <line x1="100" y1="112" x2="176" y2="112" class="wire ac" />
      <text x="138" y="104" class="tiny" text-anchor="middle">execute</text>
      <line x1="176" y1="138" x2="100" y2="138" class="wire ac" />
      <text x="138" y="156" class="tiny" text-anchor="middle">1 answer</text>
      {@render dot("M100,112 L176,112", 0, 0.3)}
      {@render dot("M176,138 L100,138", 1.6, 1.9)}

      {#each rows as i}
        <line x1="280" y1={rowY(i)} x2="320" y2={rowY(i)} class="wire" />
        {@render dot(`M280,${rowY(i)} L320,${rowY(i)}`, 0.5, 0.8)}
        {@render dot(`M320,${rowY(i)} L280,${rowY(i)}`, 1.0, 1.3)}
      {/each}
      <text x="300" y="246" class="tiny ac" text-anchor="middle">8 requests in parallel</text>
    </svg>
    <div class="pf"><b>1 model turn.</b> The code fans out, filters, sorts, and returns a ten-line answer. Intermediate data never enters the model.</div>
  </div>
</div>

<div class="stats">
  {#each stats as s}
    <div class="stat"><div class="n">{s.n}</div><div class="l">{s.l}</div><div class="s">{s.s}</div></div>
  {/each}
</div>

<figure class="tokens">
  <figcaption>Tokens through the model for one multi-step task</figcaption>
  <div class="bar"><span class="name">tool calls</span><div class="track"><i style:width="100%"></i></div><span class="val">150,000</span></div>
  <div class="bar"><span class="name">code execution</span><div class="track"><i style:width="1.4%"></i></div><span class="val">2,000</span></div>
  <div class="src">Anthropic's measurement on a document-moving task, in <a href="https://www.anthropic.com/engineering/code-execution-with-mcp" target="_blank" rel="noopener">Code execution with MCP</a>. The same mechanism this server uses.</div>
</figure>

<style>
  .cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .panel { background: var(--s1); border: 1px solid var(--b); border-radius: 8px; padding: 12px 14px 14px; }
  .panel.new { border-color: var(--ac); }
  .ph { display: flex; justify-content: space-between; font-family: var(--mono); font-size: 12px; color: var(--t); margin-bottom: 6px; }
  .ph .dim, .pf { color: var(--t3); }
  .ph .ac { color: var(--ac); }
  svg { width: 100%; height: auto; display: block; }
  .box { fill: var(--bg); stroke: var(--b2); }
  .box.sand { stroke: var(--ac); stroke-dasharray: 4 3; }
  .lbl { fill: var(--t); font-family: var(--mono); font-size: 13px; }
  .lbl.dim { fill: var(--t3); font-size: 11px; }
  .tiny { fill: var(--t3); font-family: var(--mono); font-size: 10px; }
  .tiny.ac { fill: var(--ac); }
  .wire { stroke: var(--b2); stroke-width: 1; }
  .wire.ac { stroke: var(--ac); }
  .pf { font-size: 13px; line-height: 1.5; margin-top: 8px; color: var(--t2); }
  .pf b { color: var(--t); font-weight: 600; }
  .old .pf b { color: var(--t2); }

  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 12px; }
  .stat { background: var(--s1); border: 1px solid var(--b); border-radius: 8px; padding: 14px 14px 12px; }
  .stat .n { font-size: 30px; font-weight: 700; letter-spacing: -0.02em; color: #fff; line-height: 1; }
  .stat .l { font-family: var(--mono); font-size: 12px; color: var(--ac); margin-top: 8px; }
  .stat .s { font-size: 12px; color: var(--t3); margin-top: 4px; line-height: 1.4; }

  .tokens { margin: 12px 0 0; background: var(--s1); border: 1px solid var(--b); border-radius: 8px; padding: 14px; }
  figcaption { font-family: var(--mono); font-size: 12px; color: var(--t2); margin-bottom: 10px; }
  .bar { display: grid; grid-template-columns: 112px 1fr 64px; gap: 10px; align-items: center; margin: 6px 0; }
  .name { font-family: var(--mono); font-size: 12px; color: var(--t2); }
  .track { height: 10px; background: var(--bg); border-radius: 4px; overflow: hidden; }
  .track i { display: block; height: 100%; min-width: 4px; background: #17b374; border-radius: 4px; }
  .val { font-family: var(--mono); font-size: 12px; color: var(--t); text-align: right; font-variant-numeric: tabular-nums; }
  .src { font-size: 12px; color: var(--t3); margin-top: 10px; line-height: 1.5; }

  @media (max-width: 760px) {
    .cmp { grid-template-columns: 1fr; }
    .stats { grid-template-columns: 1fr 1fr; }
    .stat .n { font-size: 26px; }
    .bar { grid-template-columns: 92px 1fr 58px; gap: 8px; }
    /* the SVGs shrink to ~0.75×, so scale their type up to stay legible */
    .lbl { font-size: 16px; }
    .lbl.dim { font-size: 13px; }
    .tiny { font-size: 12.5px; }
  }
</style>
