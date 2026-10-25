/**
 * Record/replay for Solana JSON-RPC, so transaction-building tests run offline against real mainnet
 * state. Requests are keyed by `method` + `params` (the JSON-RPC `id` is ignored).
 *
 * Record: `RECORD_RPC=1 bun test test/tx.test.ts` with RPC_URL in .dev.vars. Responses are written to
 * test/fixtures/<name>.json. Only request bodies and responses are stored, never the RPC URL.
 * Replay (default): an unrecorded call throws, naming the method, so a missing fixture is obvious.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type Entry = { method: string; params: unknown; response: unknown };
const FIXTURES = join(import.meta.dir, "..", "fixtures");

function rpcUrlFromDevVars(): string {
  const p = join(import.meta.dir, "..", "..", ".dev.vars");
  const line = readFileSync(p, "utf8").split("\n").find((l) => l.startsWith("RPC_URL="));
  if (!line) throw new Error("RECORD_RPC needs RPC_URL in .dev.vars");
  return line.slice("RPC_URL=".length).trim();
}

const keyOf = (method: string, params: unknown) => `${method} ${JSON.stringify(params ?? [])}`;

export function cassette(name: string) {
  const file = join(FIXTURES, `${name}.json`);
  const recording = process.env.RECORD_RPC === "1";
  const entries: Entry[] = !recording && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
  const byKey = new Map(entries.map((e) => [keyOf(e.method, e.params), e.response]));
  const recorded: Entry[] = [];
  const upstream = recording ? rpcUrlFromDevVars() : "";

  async function handle(body: { id?: unknown; method: string; params?: unknown }) {
    const key = keyOf(body.method, body.params);
    if (recording) {
      const res = await fetch(upstream, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = (await res.json()) as Record<string, unknown>;
      const { id: _id, ...rest } = json;
      recorded.push({ method: body.method, params: body.params ?? [], response: rest });
      return { ...rest, id: body.id };
    }
    if (!byKey.has(key)) throw new Error(`rpc-cassette(${name}): no recorded response for ${body.method} ${JSON.stringify(body.params).slice(0, 160)}`);
    return { ...(byKey.get(key) as Record<string, unknown>), id: body.id };
  }

  const fetchImpl = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const parsed = JSON.parse(String(init?.body ?? "null"));
    const out = Array.isArray(parsed) ? await Promise.all(parsed.map(handle)) : await handle(parsed);
    return new Response(JSON.stringify(out), { headers: { "content-type": "application/json" } });
  };

  return {
    fetchImpl,
    /** Writes the recording; a no-op in replay mode. */
    save() {
      if (!recording) return;
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(recorded, null, 1) + "\n");
    },
    recording,
  };
}
