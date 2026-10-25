import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// The web app lives in ./web and builds to ./dist, which wrangler serves as static assets for every
// path the Worker does not handle itself. `vite dev` proxies the Worker's own routes to `wrangler dev`.
const WORKER = "http://localhost:8790";

export default defineConfig({
  root: "web",
  publicDir: false,
  plugins: [svelte()],
  build: { outDir: "../dist", emptyOutDir: true, target: "es2022" },
  server: {
    port: 5173,
    proxy: Object.fromEntries(["/mcp", "/health", "/openapi.json", "/llms.txt", "/api"].map((p) => [p, { target: WORKER, changeOrigin: true }])),
  },
});
