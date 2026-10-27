<script lang="ts">
  import { mcp, tokenHint } from "../lib/mcp";
  import { session } from "../lib/session.svelte";

  let { code = $bindable(), authOn, showToken = true }: { code: string; authOn: boolean; showToken?: boolean } = $props();

  let draft = $state(session.token);
  let running = $state(false);
  let status = $state("");
  let output = $state("");
  let isError = $state(false);
  let copied = $state(false);

  function remember() {
    session.setToken(draft);
  }

  async function run() {
    const token = session.setToken(showToken ? draft : session.token);
    if (!token) {
      output = "Enter the bearer token first. It is only sent to this origin.";
      isError = true;
      return;
    }
    const hint = tokenHint(token);
    if (hint) {
      output = hint + " Ask whoever runs this server for its bearer token.";
      isError = true;
      return;
    }
    running = true;
    status = "running execute…";
    output = "";
    isError = false;
    try {
      const result = await mcp.execute(session.token, code);
      output = result.text;
      isError = result.isError;
      status = `${result.ms} ms · 1 tool call${result.isError ? " · tool error" : ""}`;
    } catch (error) {
      output = error instanceof Error ? error.message : String(error);
      isError = true;
      status = "failed";
    } finally {
      running = false;
    }
  }

  async function copyOutput() {
    await navigator.clipboard.writeText(output);
    copied = true;
    setTimeout(() => (copied = false), 1200);
  }
</script>

<div class="try">
  {#if showToken}
    <input type="password" bind:value={draft} onchange={remember} placeholder="bearer token · this tab session only" autocomplete="off" spellcheck="false" aria-label="Bearer token" />
  {/if}
  <div class="editor-label"><span>execute body</span><span>JavaScript · sandboxed Code Mode</span></div>
  <textarea bind:value={code} spellcheck="false" aria-label="execute body" rows="14"></textarea>
  <div class="row">
    <button class="btn" onclick={run} disabled={running || !authOn}>{running ? "running…" : "Run execute"}</button>
    <span class="meta">{status || (authOn ? "runs the real execute tool against this server" : "/mcp is off until the server has a bearer token")}</span>
  </div>
  {#if output}
    <div class="output-head"><span>result</span><button onclick={copyOutput}>{copied ? "copied" : "copy"}</button></div>
    <pre class="out" class:err={isError}>{output}</pre>
  {/if}
</div>

<style>
  .try { background: var(--s1); border: 1px solid var(--b); border-radius: 8px; padding: 14px; display: grid; gap: 10px; }
  input, textarea { background: var(--bg); border: 1px solid var(--b); color: var(--t); border-radius: 6px; padding: 10px 12px; font-size: 13px; width: 100%; box-sizing: border-box; font-family: var(--mono); line-height: 1.55; }
  textarea { resize: vertical; min-height: 260px; tab-size: 2; }
  input:focus, textarea:focus { outline: none; border-color: var(--t3); }
  .editor-label, .output-head { display: flex; justify-content: space-between; align-items: center; color: var(--t3); font: 10px var(--mono); text-transform: uppercase; letter-spacing: .08em; }
  .output-head { margin-top: 4px; }
  .output-head button { color: var(--t3); padding: 0; font: inherit; text-transform: none; }
  .output-head button:hover { color: var(--t); }
  .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .btn { background: var(--ac); color: var(--ac-ink); font-weight: 600; border-radius: 6px; padding: 9px 16px; font-size: 13px; }
  .btn:hover:not(:disabled) { filter: brightness(1.08); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .meta { font-family: var(--mono); font-size: 11px; color: var(--t3); }
  .out { margin: 0; font-size: 12px; color: var(--t); background: var(--bg); border-radius: 6px; padding: 12px; border: 1px solid var(--b); line-height: 1.5; max-height: 520px; overflow: auto; white-space: pre-wrap; word-break: break-word; }
  .out.err { color: var(--err); }
  @media (max-width: 760px) {
    input, textarea { font-size: 16px; }
    .btn { padding: 12px 18px; font-size: 15px; }
  }
</style>
