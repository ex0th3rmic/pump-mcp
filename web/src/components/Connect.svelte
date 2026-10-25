<script lang="ts">
  import { snippets } from "../lib/snippets";

  let { mcpUrl }: { mcpUrl: string } = $props();
  let active = $state(snippets[0]!.id);
  let copied = $state(false);
  const current = $derived(snippets.find((s) => s.id === active) ?? snippets[0]!);
  const code = $derived(current.code(mcpUrl));

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch {
      /* clipboard blocked: the text is selectable */
    }
  }
</script>

<ol class="howto">
  <li>
    <b>Get the token.</b> There is no signup. The person running this server generates the bearer token and hands it out privately; it is the only credential, and it is never shown on this page.
    <span class="self">Running your own copy? Generate one with <code>openssl rand -hex 32</code>, then <code>npx wrangler secret put MCP_BEARER_TOKEN</code> and paste it. Setting a new one invalidates the old one.</span>
  </li>
  <li><b>Add the server to your agent.</b> Pick your client below, copy the snippet, and replace <code>&lt;token&gt;</code> with the value you were given.</li>
  <li><b>Ask about a coin.</b> Start with something like “What's the price and graduation progress of &lt;mint&gt;?” The agent finds the route, writes the code, and answers in one call.</li>
</ol>
<div class="tabs" role="tablist" aria-label="MCP client">
  {#each snippets as s (s.id)}
    <button role="tab" aria-selected={s.id === active} class:active={s.id === active} onclick={() => (active = s.id)}>{s.label}</button>
  {/each}
</div>
<div class="block">
  <div class="cap">{current.caption}</div>
  <pre><code>{code}</code></pre>
  <button class="copy" onclick={copy} aria-live="polite">{copied ? "copied" : "copy"}</button>
</div>
<p class="hint">Without a token you can still read <a href="/health">/health</a>, <a href="/openapi.json">/openapi.json</a>, <a href="/llms.txt">/llms.txt</a> and the live curve above. Everything the agent does goes through <code>/mcp</code> and needs it.</p>

<style>
  .howto { margin: 0 0 16px; padding: 0 0 0 22px; display: grid; gap: 8px; font-size: 13.5px; color: var(--t2); line-height: 1.55; max-width: 80ch; }
  .howto li::marker { font-family: var(--mono); color: var(--ac); font-weight: 600; }
  .howto b { color: var(--t); font-weight: 600; }
  .howto code { font-size: 12px; color: var(--t); background: var(--s1); border: 1px solid var(--b); border-radius: 4px; padding: 1px 5px; }
  .howto .self { display: block; margin-top: 4px; color: var(--t3); }
  .tabs { display: flex; gap: 2px; margin-bottom: -1px; flex-wrap: wrap; }
  .tabs button {
    font-family: var(--mono);
    font-size: 12px;
    padding: 7px 12px;
    border: 1px solid var(--b);
    border-bottom: none;
    border-radius: 6px 6px 0 0;
    color: var(--t3);
    background: var(--bg);
  }
  .tabs button:hover { color: var(--t2); }
  @media (max-width: 760px) {
    .tabs { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; padding-bottom: 1px; }
    .tabs::-webkit-scrollbar { display: none; }
    .tabs button { flex: 0 0 auto; padding: 10px 14px; font-size: 13px; }
    .block { border-radius: 0 0 6px 6px; }
    pre { font-size: 12.5px; }
  }
  .tabs button.active { color: var(--t); background: var(--s1); }
  .block { position: relative; background: var(--s1); border: 1px solid var(--b); border-radius: 0 6px 6px 6px; }
  .cap { font-family: var(--mono); font-size: 11px; color: var(--t3); padding: 10px 16px 0; }
  pre { margin: 0; padding: 10px 16px 14px; font-size: 13px; line-height: 1.5; overflow: auto; color: var(--t); }
  .copy {
    position: absolute;
    top: 8px;
    right: 8px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--t2);
    border: 1px solid var(--b2);
    border-radius: 4px;
    padding: 3px 9px;
    background: var(--s2);
  }
  .copy:hover { color: var(--t); border-color: var(--t3); }
  .hint { font-size: 13px; color: var(--t2); margin: 10px 0 0; }
  .hint code { font-size: 12px; }
</style>
