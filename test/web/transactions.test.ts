import { describe, expect, test } from "bun:test";
import { Keypair, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { McpClient } from "../../web/src/lib/mcp";
import {
  base64ToBytes,
  broadcastTrade,
  buildTrade,
  bytesToBase64,
  confirmationPhase,
  signTrade,
  simulateTrade,
} from "../../web/src/lib/transactions";
import type { TradeResult } from "../../web/src/lib/types";

function preview(): TradeResult {
  const payer = Keypair.generate();
  const transaction = new VersionedTransaction(new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [],
  }).compileToV0Message());
  return {
    transaction: bytesToBase64(transaction.serialize()),
    encoding: "base64",
    bytes: transaction.serialize().length,
    action: "buy",
    venue: "pump",
    mint: payer.publicKey.toBase58(),
    quote: { quoteSymbol: "SOL", quoteIn: 0.05, tokensOut: "100", slippagePct: 10 },
    requiredSigners: [payer.publicKey.toBase58()],
    signedBy: [],
    lastValidBlockHeight: 100,
    lookupTablesUsed: [],
    note: "test",
  };
}

function clientReturning(payload: unknown, codes: string[] = []): McpClient {
  return new McpClient(async (_input, init) => {
    const request = JSON.parse(init!.body as string) as { id?: number; method: string; params?: { arguments?: { code: string } } };
    if (request.params?.arguments?.code) codes.push(request.params.arguments.code);
    const body = request.method === "initialize"
      ? { jsonrpc: "2.0", id: request.id, result: {} }
      : request.method === "notifications/initialized" ? {}
      : { jsonrpc: "2.0", id: request.id, result: { content: [{ type: "text", text: JSON.stringify(payload) }] } };
    return new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "mcp-session-id": "test" } });
  });
}

describe("transaction helpers", () => {
  test("builds and validates a versioned transaction and simulates without signature verification", async () => {
    const codes: string[] = [];
    const built = await buildTrade("a-long-enough-token", { action: "buy" }, clientReturning(preview(), codes));
    expect(built.encoding).toBe("base64");
    const simulation = await simulateTrade("a-long-enough-token", built, clientReturning({ value: { err: null, logs: ["ok"] } }, codes));
    expect(simulation).toEqual({ err: null, logs: ["ok"] });
    expect(codes[1]).toContain('"sigVerify":false');
    expect(codes[1]).toContain('"encoding":"base64"');
  });

  test("uses the injected wallet signer and propagates signing rejection without a broadcast", async () => {
    const built = preview();
    let called = 0;
    const signed = await signTrade(built, "devnet", async (bytes, cluster) => {
      called++;
      expect(cluster).toBe("devnet");
      expect(bytes).toEqual(base64ToBytes(built.transaction));
      return bytes;
    });
    expect(signed).toBe(built.transaction);
    expect(called).toBe(1);
    await expect(signTrade(built, "mainnet-beta", async () => { throw new Error("User rejected"); })).rejects.toThrow("User rejected");
  });

  test("broadcasts only signed base64 with preflight enabled", async () => {
    const codes: string[] = [];
    const signature = await broadcastTrade("a-long-enough-token", preview().transaction, clientReturning("signature-1", codes));
    expect(signature).toBe("signature-1");
    expect(codes[0]).toContain("sendTransaction");
    expect(codes[0]).toContain('"skipPreflight":false');
    expect(codes[0]).toContain('"preflightCommitment":"confirmed"');
  });

  test.each([
    [{ status: { confirmationStatus: "processed" }, currentLastValidBlockHeight: 100 }, "submitted"],
    [{ status: null, currentLastValidBlockHeight: 100 }, "not-found"],
    [{ status: { confirmationStatus: "confirmed" }, currentLastValidBlockHeight: 101 }, "confirmed"],
    [{ status: { confirmationStatus: "finalized" }, currentLastValidBlockHeight: 101 }, "finalized"],
    [{ status: { err: { InstructionError: [0, "Custom"] } }, currentLastValidBlockHeight: 100 }, "failed"],
    [{ status: null, currentLastValidBlockHeight: 101 }, "expired"],
  ] as const)("maps confirmation state %#", (state, expected) => {
    expect(confirmationPhase(state, 100).phase).toBe(expected);
  });
});
