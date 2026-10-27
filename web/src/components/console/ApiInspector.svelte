<script lang="ts">
  import { filterOperations, listOperations, operationSnippet, resolveLocalRef, type ApiOperation, type OpenApiDocument } from "../../lib/openapi";

  let document = $state<OpenApiDocument | null>(null);
  let query = $state("");
  let selectedKey = $state("");
  let loading = $state(true);
  let error = $state("");
  let copied = $state(false);
  const operations = $derived(document ? filterOperations(listOperations(document), query) : []);
  const selected = $derived(operations.find((operation) => operation.key === selectedKey) ?? operations[0] ?? null);

  $effect(() => {
    fetch("/openapi.json")
      .then(async (response) => {
        if (!response.ok) throw new Error(`OpenAPI request returned ${response.status}`);
        document = await response.json() as OpenApiDocument;
      })
      .catch((cause) => { error = cause instanceof Error ? cause.message : String(cause); })
      .finally(() => { loading = false; });
  });

  function schema(value: unknown): string {
    return JSON.stringify(document ? resolveLocalRef(document, value) : value, null, 2);
  }

  async function copySnippet(operation: ApiOperation) {
    await navigator.clipboard.writeText(operationSnippet(operation));
    copied = true;
    setTimeout(() => (copied = false), 1200);
  }
</script>

<section class="api-shell">
  <div class="api-head">
    <div><span class="kicker">one merged document</span><h2>Explore the entire route surface.</h2></div>
    <a href="/openapi.json" target="_blank" rel="noopener">openapi.json</a>
  </div>
  <p class="intro">Inspect official pump.fun operations and the keyless chain, trade, and metadata routes. Templates run through the same sandboxed execute tool.</p>
  <input class="search" bind:value={query} placeholder="Search path, method, summary, or tag…" aria-label="Search API operations" />
  {#if loading}<p class="loading">Loading the OpenAPI document…</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if document}
    <div class="workspace">
      <div class="operation-list">
        <div class="count">{operations.length} operations</div>
        {#each operations as operation}
          <button class:active={selected?.key === operation.key} onclick={() => (selectedKey = operation.key)}>
            <span class:get={operation.method === "GET"} class:post={operation.method === "POST"}>{operation.method}</span>
            <code>{operation.path}</code>
          </button>
        {:else}<p class="loading">No operations match this search.</p>{/each}
      </div>
      {#if selected}
        <article class="operation-detail">
          <div class="operation-title"><div><span class="method">{selected.method}</span><code>{selected.path}</code></div>{#if selected.deprecated}<b class="deprecated">deprecated</b>{/if}</div>
          <h3>{selected.summary}</h3>
          {#if selected.description}<p class="description">{selected.description}</p>{/if}
          <div class="badges">
            {#each selected.tags as tag}<span>{tag}</span>{/each}
            <span>{selected.security?.length === 0 ? "MCP bearer · no pump.fun key" : "MCP bearer · operator key may be required"}</span>
          </div>
          {#if selected.parameters?.length}
            <h4>Parameters</h4>
            <div class="table-wrap"><table><thead><tr><th>Name</th><th>In</th><th>Required</th><th>Description</th></tr></thead><tbody>
              {#each selected.parameters as parameter}
                <tr><td><code>{parameter.name}</code></td><td>{parameter.in}</td><td>{parameter.required ? "yes" : "no"}</td><td>{parameter.description ?? schema(parameter.schema)}</td></tr>
              {/each}
            </tbody></table></div>
          {/if}
          {#if selected.requestBody}
            <h4>Request body</h4><pre>{schema(selected.requestBody)}</pre>
          {/if}
          {#if selected.responses}
            <details><summary>Response schemas</summary><pre>{schema(selected.responses)}</pre></details>
          {/if}
          <h4>Execute template</h4>
          <p class="template-note">Replace path placeholders, query values, and the request body before running.</p>
          <div class="snippet"><button onclick={() => copySnippet(selected)}>{copied ? "copied" : "copy"}</button><pre>{operationSnippet(selected)}</pre></div>
        </article>
      {/if}
    </div>
  {/if}
</section>

<style>
  .api-shell { min-width: 0; }
  .api-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
  .kicker { color: var(--ac); font: 10px var(--mono); text-transform: uppercase; letter-spacing: .1em; }
  h2 { margin: 6px 0 0; font-size: 22px; letter-spacing: -.025em; }
  .api-head a { color: var(--t3); font: 10px var(--mono); }
  .intro { max-width: 78ch; color: var(--t2); font-size: 13px; line-height: 1.55; }
  .search { box-sizing: border-box; width: 100%; margin: 10px 0 14px; padding: 11px 12px; border: 1px solid var(--b); border-radius: 6px; background: var(--s1); color: var(--t); font: 12px var(--mono); }
  .workspace { display: grid; grid-template-columns: minmax(260px,.7fr) minmax(400px,1.3fr); gap: 14px; align-items: start; }
  .operation-list, .operation-detail { border: 1px solid var(--b); border-radius: 8px; background: var(--s1); }
  .operation-list { max-height: 720px; overflow: auto; padding: 8px; }
  .count { padding: 6px 8px 10px; color: var(--t3); font: 10px var(--mono); }
  .operation-list button { display: grid; grid-template-columns: 38px minmax(0,1fr); gap: 8px; width: 100%; padding: 9px 8px; border-radius: 5px; text-align: left; }
  .operation-list button:hover, .operation-list button.active { background: var(--s2); }
  .operation-list button.active { box-shadow: inset 2px 0 var(--ac); }
  .operation-list button span { color: var(--warn); font: 9px var(--mono); }
  .operation-list button span.get { color: var(--ac); }
  .operation-list button span.post { color: #76a9e8; }
  .operation-list button code { color: var(--t2); font-size: 10px; overflow-wrap: anywhere; }
  .operation-detail { min-width: 0; padding: 20px; }
  .operation-title { display: flex; justify-content: space-between; gap: 12px; }
  .operation-title > div { display: flex; gap: 10px; align-items: center; min-width: 0; }
  .operation-title code { color: var(--t); font-size: 12px; overflow-wrap: anywhere; }
  .method { color: var(--ac); font: 10px var(--mono); }
  .deprecated { color: var(--warn); font: 9px var(--mono); text-transform: uppercase; }
  h3 { margin: 16px 0 8px; font-size: 17px; }
  .description { color: var(--t2); font-size: 12px; line-height: 1.6; white-space: pre-wrap; }
  .badges { display: flex; flex-wrap: wrap; gap: 6px; margin: 14px 0; }
  .badges span { padding: 3px 6px; border: 1px solid var(--b); border-radius: 4px; color: var(--t3); font: 9px var(--mono); }
  h4 { margin: 22px 0 8px; color: var(--t2); font: 10px var(--mono); text-transform: uppercase; letter-spacing: .08em; }
  pre { max-height: 320px; overflow: auto; box-sizing: border-box; padding: 12px; border: 1px solid var(--b); border-radius: 6px; background: var(--bg); color: var(--t2); font: 10px/1.55 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { padding: 8px; border-bottom: 1px solid var(--b); text-align: left; vertical-align: top; }
  th { color: var(--t3); font: 9px var(--mono); } td { color: var(--t2); }
  details summary { color: var(--t3); cursor: pointer; font: 11px var(--mono); }
  .template-note { color: var(--t3); font-size: 11px; }
  .snippet { position: relative; }
  .snippet button { position: absolute; right: 8px; top: 8px; z-index: 1; color: var(--t3); font: 10px var(--mono); }
  .loading { color: var(--t3); font: 11px var(--mono); } .error { color: var(--err); font-size: 12px; }
  @media (max-width: 950px) { .workspace { grid-template-columns: 1fr; } .operation-list { max-height: 300px; } }
  @media (max-width: 600px) { .operation-detail { padding: 14px; } .search { font-size: 16px; } }
</style>
