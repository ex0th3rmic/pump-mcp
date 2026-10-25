<script lang="ts">
  import { codeFor, examples, groups, type Example } from "../lib/examples";

  let { mint, hasKey, onpick }: { mint: string | null; hasKey: boolean; onpick: (code: string) => void } = $props();
  const byGroup = $derived(groups.map((g) => ({ ...g, items: examples.filter((e) => e.group === g.id) })));
  const pick = (ex: Example) => onpick(codeFor(ex, mint));
</script>

{#each byGroup as g (g.id)}
  <div class="grp"><span>{g.title}</span> — {g.note}{#if g.link} <a href={g.link.href} target="_blank" rel="noopener">{g.link.text}</a>{/if}</div>
  <div class="examples">
    {#each g.items as ex (ex.id)}
      <button class="ex" class:wide={ex.wide} onclick={() => pick(ex)} title="Load this into the playground">
        {#if ex.oneCall}<span class="fast">1 call</span>{/if}
        <p class="q">“{ex.q}”</p>
        <p class="a">{ex.a}</p>
        <div class="r">{#each ex.routes as r}<span class="code-tag">{r}</span>{/each}</div>
        {#if ex.needsKey}
          <div class="need">{hasKey ? "uses the operator's pump.fun key" : "requires PUMP_API_KEY · pending approval"}</div>
        {/if}
      </button>
    {/each}
  </div>
{/each}

<style>
  .grp { font-family: var(--mono); font-size: 12px; color: var(--t3); margin: 20px 0 8px; }
  .grp span { color: var(--t); }
  .examples { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .ex {
    display: block;
    text-align: left;
    background: var(--s1);
    border: 1px solid var(--b);
    border-radius: 8px;
    padding: 14px 14px 12px;
    position: relative;
    transition: border-color 0.15s, background 0.15s;
  }
  .ex:hover { border-color: var(--b2); background: var(--s2); }
  .ex.wide { grid-column: 1 / -1; }
  .q { font-size: 14.5px; font-weight: 600; margin: 0 0 6px; color: #fff; line-height: 1.35; padding-right: 64px; }
  .a { font-size: 13px; color: var(--t2); margin: 0 0 10px; line-height: 1.5; }
  .r { display: flex; gap: 6px; flex-wrap: wrap; }
  .need { font-family: var(--mono); font-size: 11px; color: var(--warn); margin-top: 8px; }
  .fast {
    position: absolute;
    top: 12px;
    right: 12px;
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ac);
    background: var(--ac-bg);
    padding: 2px 7px;
    border-radius: 4px;
    font-weight: 600;
  }
  @media (max-width: 640px) {
    .examples { grid-template-columns: 1fr; }
  }
</style>
