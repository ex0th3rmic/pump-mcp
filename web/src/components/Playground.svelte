<script lang="ts">
  import { codeFor } from "../lib/examples";
  import { demoExamples, demoResultFor } from "../lib/demo";
  import { mcp, tokenHint } from "../lib/mcp";
  import { session } from "../lib/session.svelte";

  let { code = $bindable(), authOn, showToken = true, demo = false }: { code: string; authOn: boolean; showToken?: boolean; demo?: boolean } = $props();

  let draft = $state(session.token);
  let selectedDemo = $state("mode");
  let running = $state(false);
  let status = $state("");
  let output = $state("");
  let isError = $state(false);
  let copied = $state(false);

  function remember() {
    session.setToken(draft);
  }

  function chooseDemo(id: string) {
    selectedDemo = id;
    const example = demoExamples.find((item) => item.id === id);
    if (example) code = codeFor(example, null);
    output = "";
    status = "";
    isError = false;
  }

  async function run() {
    if (demo) {
      running = true;
      output = "";
      isError = false;
      status = "preparing sample…";
      await new Promise((resolve) => setTimeout(resolve, 250));
      output = JSON.stringify(demoResultFor(code), null, 2);
      status = "sample result · no network calls";
      running = false;
      return;
    }
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
  {#if showToken && !demo}
    <input type="password" bind:value={draft} onchange={remember} placeholder="bearer token · this tab session only" autocomplete="off" spellcheck="false" aria-label="Bearer token" />
  {/if}
  {#if demo}
    <div class="demo-picker">
      <label for="demo-example">Curated example</label>
      <select id="demo-example" value={selectedDemo} onchange={(event) => chooseDemo(event.currentTarget.value)}>
        {#each demoExamples as example}<option value={example.id}>{example.q}</option>{/each}
      </select>
      <span>Sample results are illustrative. The code is not executed and no request leaves your browser.</span>
    </div>
  {/if}
  <div class="editor-label"><span>execute body</span><span>{demo ? "sample JavaScript · not executed" : "JavaScript · sandboxed Code Mode"}</span></div>
  <textarea bind:value={code} readonly={demo} spellcheck="false" aria-label="execute body" rows="14"></textarea>
  <div class="row">
    <button class="btn" onclick={run} disabled={running || (!demo && !authOn)}>{running ? "running…" : demo ? "Show sample result" : "Run execute"}</button>
    <span class="meta">{status || (demo ? "read-only demo · zero MCP calls" : authOn ? "runs the real execute tool against this server" : "/mcp is off until the server has a bearer token")}</span>
  </div>
  {#if output}
    <div class="output-head"><span>{demo ? "sample result" : "result"}</span><button onclick={copyOutput}>{copied ? "copied" : "copy"}</button></div>
    <pre class="out" class:err={isError}>{output}</pre>
  {/if}
</div>

<style>
  .try { background: var(--s1); border: 1px solid var(--b); border-radius: 8px; padding: 14px; display: grid; gap: 10px; }
  input, textarea, select { background: var(--bg); border: 1px solid var(--b); color: var(--t); border-radius: 6px; padding: 10px 12px; font-size: 13px; width: 100%; box-sizing: border-box; font-family: var(--mono); line-height: 1.55; }
  textarea { resize: vertical; min-height: 260px; tab-size: 2; }
  textarea[readonly] { color: var(--t2); resize: none; }
  input:focus, textarea:focus, select:focus { outline: none; border-color: var(--t3); }
  .demo-picker { display: grid; gap: 7px; margin-bottom: 4px; padding: 12px; border: 1px solid rgba(217,165,59,.2); border-radius: 6px; background: rgba(217,165,59,.05); }
  .demo-picker label { color: var(--warn); font: 10px var(--mono); text-transform: uppercase; letter-spacing: .08em; }
  .demo-picker span { color: var(--t3); font-size: 11px; line-height: 1.5; }
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
    input, textarea, select { font-size: 16px; }
    .btn { padding: 12px 18px; font-size: 15px; }
  }
</style>
