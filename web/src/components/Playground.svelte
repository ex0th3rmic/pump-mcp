<script lang="ts">
  import { runExecute } from "../lib/mcp";

  let { code = $bindable(), authOn }: { code: string; authOn: boolean } = $props();

  const KEY = "pump-mcp-token";
  let token = $state("");
  let running = $state(false);
  let status = $state("");
  let output = $state("");
  let isError = $state(false);

  $effect(() => {
    try {
      token = localStorage.getItem(KEY) ?? "";
    } catch {
      /* storage blocked */
    }
  });

  function remember() {
    try {
      localStorage.setItem(KEY, token);
    } catch {
      /* storage blocked */
    }
  }

  async function run() {
    if (!token.trim()) {
      output = "Enter the bearer token first. It is only sent to this origin.";
      isError = true;
      return;
    }
    running = true;
    status = "running execute…";
    output = "";
    isError = false;
    try {
      const r = await runExecute(token.trim(), code);
      output = r.text;
      isError = r.isError;
      status = `${r.ms} ms · 1 tool call${r.isError ? " · tool error" : ""}`;
    } catch (e) {
      output = e instanceof Error ? e.message : String(e);
      isError = true;
      status = "failed";
    } finally {
      running = false;
    }
  }
</script>

<div class="try">
  <input type="password" bind:value={token} onchange={remember} placeholder="bearer token · stored in this browser only" autocomplete="off" spellcheck="false" aria-label="Bearer token" />
  <textarea bind:value={code} spellcheck="false" aria-label="execute body" rows="9"></textarea>
  <div class="row">
    <button class="btn" onclick={run} disabled={running || !authOn}>{running ? "running…" : "Run"}</button>
    <span class="meta">{status || (authOn ? "runs the real execute tool against this server" : "/mcp is off until the server has a bearer token")}</span>
  </div>
  {#if output}
    <pre class="out" class:err={isError}>{output}</pre>
  {/if}
</div>

<style>
  .try { background: var(--s1); border: 1px solid var(--b); border-radius: 8px; padding: 14px; display: grid; gap: 10px; }
  input, textarea {
    background: var(--bg);
    border: 1px solid var(--b);
    color: var(--t);
    border-radius: 6px;
    padding: 9px 11px;
    font-size: 13px;
    width: 100%;
    font-family: var(--mono);
    line-height: 1.5;
  }
  textarea { resize: vertical; min-height: 120px; }
  input:focus, textarea:focus { outline: none; border-color: var(--t3); }
  .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .btn { background: var(--ac); color: var(--ac-ink); font-weight: 600; border-radius: 6px; padding: 9px 16px; font-size: 13px; }
  .btn:hover:not(:disabled) { filter: brightness(1.08); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .meta { font-family: var(--mono); font-size: 12px; color: var(--t3); }
  .out {
    margin: 0;
    font-size: 12px;
    color: var(--t);
    background: var(--bg);
    border-radius: 6px;
    padding: 10px 12px;
    border: 1px solid var(--b);
    line-height: 1.5;
    max-height: 420px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .out.err { color: var(--err); }
  @media (max-width: 760px) {
    input, textarea { font-size: 16px; } /* keeps iOS from zooming on focus */
    .btn { padding: 12px 18px; font-size: 15px; width: 100%; text-align: center; }
    .row { flex-direction: column; align-items: stretch; }
  }
</style>
