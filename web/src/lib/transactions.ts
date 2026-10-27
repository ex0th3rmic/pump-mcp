import { VersionedTransaction } from "@solana/web3.js";
import { mcp, type McpClient } from "./mcp";
import type { Health, TradeResult } from "./types";

export type TransactionPhase = "preview" | "simulated" | "signing" | "submitted" | "confirmed" | "finalized" | "failed" | "expired" | "not-found";

export interface SimulationResult {
  err: unknown;
  logs: string[];
}

export interface ConfirmationResult {
  phase: TransactionPhase;
  error?: unknown;
}

export type TransactionSigner = (transaction: Uint8Array, cluster: Health["cluster"]) => Promise<Uint8Array>;

export function tradeCode(body: Record<string, unknown>): string {
  return `async () => codemode.request({ method: "POST", path: "/trade", body: ${JSON.stringify(body)} })`;
}

export function rpcCode(method: string, params: unknown[]): string {
  return `async () => codemode.request({ method: "POST", path: "/rpc", body: { method: ${JSON.stringify(method)}, params: ${JSON.stringify(params)} } })`;
}

async function executeData<T>(client: McpClient, token: string, code: string): Promise<T> {
  const result = await client.execute<T>(token, code);
  if (result.isError || result.data === null) throw new Error(result.text || "The MCP operation returned no structured data.");
  return result.data;
}

function isTradeResult(value: unknown): value is TradeResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<TradeResult>;
  return typeof result.transaction === "string" && result.encoding === "base64" && typeof result.mint === "string" && typeof result.lastValidBlockHeight === "number";
}

export async function buildTrade(token: string, body: Record<string, unknown>, client: McpClient = mcp): Promise<TradeResult> {
  const result = await executeData<unknown>(client, token, tradeCode(body));
  if (!isTradeResult(result)) throw new Error("The trade builder returned an invalid transaction preview.");
  VersionedTransaction.deserialize(base64ToBytes(result.transaction));
  return result;
}

export async function simulateTrade(token: string, preview: TradeResult, client: McpClient = mcp): Promise<SimulationResult> {
  const result = await executeData<{ value?: { err?: unknown; logs?: string[] } }>(client, token, rpcCode("simulateTransaction", [
    preview.transaction,
    { encoding: "base64", sigVerify: false, commitment: "confirmed", replaceRecentBlockhash: false },
  ]));
  return { err: result.value?.err ?? null, logs: result.value?.logs ?? [] };
}

export async function signTrade(preview: TradeResult, cluster: Health["cluster"], signer: TransactionSigner): Promise<string> {
  const unsigned = base64ToBytes(preview.transaction);
  VersionedTransaction.deserialize(unsigned);
  const signed = await signer(unsigned, cluster);
  VersionedTransaction.deserialize(signed);
  return bytesToBase64(signed);
}

export async function broadcastTrade(token: string, signedTransaction: string, client: McpClient = mcp): Promise<string> {
  const signature = await executeData<unknown>(client, token, rpcCode("sendTransaction", [
    signedTransaction,
    { encoding: "base64", skipPreflight: false, preflightCommitment: "confirmed" },
  ]));
  if (typeof signature !== "string" || !signature) throw new Error("Solana RPC returned no transaction signature.");
  return signature;
}

export function confirmationPhase(result: {
  status: null | { err?: unknown; confirmationStatus?: string };
  currentLastValidBlockHeight: number;
}, lastValidBlockHeight: number): ConfirmationResult {
  if (result.status?.err) return { phase: "failed", error: result.status.err };
  if (result.status?.confirmationStatus === "finalized") return { phase: "finalized" };
  if (result.status?.confirmationStatus === "confirmed") return { phase: "confirmed" };
  if (result.currentLastValidBlockHeight > lastValidBlockHeight) return { phase: "expired" };
  return { phase: result.status ? "submitted" : "not-found" };
}

export async function checkConfirmation(token: string, signature: string, lastValidBlockHeight: number, client: McpClient = mcp): Promise<ConfirmationResult> {
  const code = `async () => {
  const [statuses, latest] = await Promise.all([
    codemode.request({ method: "POST", path: "/rpc", body: { method: "getSignatureStatuses", params: [[${JSON.stringify(signature)}], { searchTransactionHistory: true }] } }),
    codemode.request({ method: "POST", path: "/rpc", body: { method: "getLatestBlockhash", params: [{ commitment: "confirmed" }] } }),
  ]);
  return { status: statuses.value?.[0] ?? null, currentLastValidBlockHeight: latest.value.lastValidBlockHeight };
}`;
  const result = await executeData<{
    status: null | { err?: unknown; confirmationStatus?: string };
    currentLastValidBlockHeight: number;
  }>(client, token, code);
  return confirmationPhase(result, lastValidBlockHeight);
}

export function solscanTx(signature: string, cluster: Health["cluster"]): string {
  return `https://solscan.io/tx/${signature}${cluster === "devnet" ? "?cluster=devnet" : ""}`;
}

export function solscanAccount(address: string, cluster: Health["cluster"]): string {
  return `https://solscan.io/account/${address}${cluster === "devnet" ? "?cluster=devnet" : ""}`;
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export const nextPoll = (ms = 2500) => new Promise<void>((resolve) => setTimeout(resolve, ms));
