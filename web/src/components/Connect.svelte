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
<p class="hint">Replace <code>&lt;token&gt;</code> with the server's bearer token. Then ask the agent about any pump.fun coin.</p>

<style>
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
