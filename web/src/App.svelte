<script lang="ts">
  import Home from "./components/Home.svelte";
  import Console from "./components/console/Console.svelte";
  import { route } from "./lib/router.svelte";
</script>

{#if route.path.startsWith("/app")}
  <Console />
{:else}
  <Home />
{/if}
