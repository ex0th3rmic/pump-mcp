import { describe, expect, test } from "bun:test";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { bondingCurveAddress, decodeBondingCurve, PUMP_PROGRAM_ID, TOKEN_DECIMALS } from "../../src/curve";
import type { Env } from "../../src/env";
import type { TradeResult } from "../../src/tx";
import { handleRequest } from "../../src/upstreams";

const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const MAINNET_GENESIS_HASH = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
const DEFAULT_DEVNET_RPC = "https://api.devnet.solana.com";

function assertDevnetGenesisHash(hash: string): void {
  if (hash !== DEVNET_GENESIS_HASH) throw new Error("Refusing to run launch integration test on a non-devnet cluster");
}

function deserialize(result: TradeResult): VersionedTransaction {
  return VersionedTransaction.deserialize(Buffer.from(result.transaction, "base64"));
}

async function buildTrade(env: Env, body: Record<string, unknown>): Promise<TradeResult> {
  return (await handleRequest({ method: "POST", path: "/trade", body }, env)) as TradeResult;
}

async function airdrop(connection: Connection, wallet: PublicKey, sol: number): Promise<void> {
  const signature = await connection.requestAirdrop(wallet, Math.round(sol * LAMPORTS_PER_SOL));
  const confirmation = await connection.confirmTransaction(signature, "confirmed");
  if (confirmation.value.err) throw new Error(`Devnet airdrop failed: ${JSON.stringify(confirmation.value.err)}`);
}

async function signSendAndConfirm(connection: Connection, result: TradeResult, signer: Keypair): Promise<string> {
  const transaction = deserialize(result);
  transaction.sign([signer]);
  const simulation = await connection.simulateTransaction(transaction);
  if (simulation.value.err) {
    const logs = simulation.value.logs?.join("\n") ?? "no simulation logs";
    throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}\n${logs}`);
  }
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });
  const confirmation = await connection.confirmTransaction(
    {
      signature,
      blockhash: transaction.message.recentBlockhash,
      lastValidBlockHeight: result.lastValidBlockHeight,
    },
    "confirmed",
  );
  if (confirmation.value.err) throw new Error(`Transaction confirmation failed: ${JSON.stringify(confirmation.value.err)}`);
  return signature;
}

async function readMint(connection: Connection, mint: PublicKey) {
  const account = await connection.getAccountInfo(mint, "confirmed");
  if (!account) throw new Error("Created mint is missing on devnet");
  return {
    owner: account.owner,
    supply: account.data.readBigUInt64LE(36),
    decimals: account.data[44],
  };
}

async function readCurve(connection: Connection, mint: PublicKey) {
  const address = new PublicKey(bondingCurveAddress(mint.toBase58()));
  const account = await connection.getAccountInfo(address, "confirmed");
  if (!account) throw new Error("Created bonding curve is missing on devnet");
  if (!account.owner.equals(new PublicKey(PUMP_PROGRAM_ID))) throw new Error("Bonding curve has an unexpected owner");
  return decodeBondingCurve(account.data);
}

function tokenAddress(mint: PublicKey, owner: PublicKey, tokenProgram: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(mint, owner, true, tokenProgram);
}

async function tokenBalance(connection: Connection, mint: PublicKey, owner: PublicKey, tokenProgram: PublicKey): Promise<bigint> {
  const address = tokenAddress(mint, owner, tokenProgram);
  const account = await connection.getAccountInfo(address, "confirmed");
  if (!account) return 0n;
  const balance = await connection.getTokenAccountBalance(address, "confirmed");
  return BigInt(balance.value.amount);
}

function rawTokens(amount: string | undefined): bigint {
  if (!amount || !/^\d+(\.\d{1,6})?$/.test(amount)) throw new Error(`Invalid token quote: ${amount}`);
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole!) * 10n ** BigInt(TOKEN_DECIMALS) + BigInt(fraction.padEnd(TOKEN_DECIMALS, "0"));
}

describe("devnet launch integration safety", () => {
  test("accepts the devnet genesis hash", () => {
    expect(() => assertDevnetGenesisHash(DEVNET_GENESIS_HASH)).not.toThrow();
  });

  test.each([
    ["mainnet", MAINNET_GENESIS_HASH],
    ["an unknown cluster", "11111111111111111111111111111111"],
  ])("rejects %s", (_name, hash) => {
    expect(() => assertDevnetGenesisHash(hash)).toThrow("non-devnet cluster");
  });
});

const liveTest = process.env.RUN_DEVNET_INTEGRATION === "1" ? test : test.skip;

liveTest("launches one coin and verifies two sequential devnet purchases", async () => {
  const rpcUrl = process.env.DEVNET_RPC_URL ?? DEFAULT_DEVNET_RPC;
  const connection = new Connection(rpcUrl, "confirmed");
  assertDevnetGenesisHash(await connection.getGenesisHash());

  const program = await connection.getAccountInfo(new PublicKey(PUMP_PROGRAM_ID), "confirmed");
  if (!program?.executable) throw new Error("Devnet pump program is missing or not executable");
  const sdk = new OnlinePumpSdk(connection);
  const [global, feeConfig] = await Promise.all([sdk.fetchGlobal(), sdk.fetchFeeConfig()]);
  expect(feeConfig).toBeDefined();
  if (!global.createV2Enabled) throw new Error("Devnet pump program does not have create-v2 enabled");

  const creator = Keypair.generate();
  const buyerOne = Keypair.generate();
  const buyerTwo = Keypair.generate();
  await airdrop(connection, creator.publicKey, 0.2);
  await airdrop(connection, buyerOne.publicKey, 0.05);
  await airdrop(connection, buyerTwo.publicKey, 0.05);

  const env = { LOADER: {} as WorkerLoader, RPC_URL: rpcUrl } as Env;
  const create = await buildTrade(env, {
    publicKey: creator.publicKey.toBase58(),
    action: "create",
    amount: 0,
    denominatedInSol: true,
    slippage: 10,
    priorityFee: 0,
    pool: "pump",
    tokenMetadata: {
      name: "Devnet Integration Test",
      symbol: "DIT",
      uri: "https://example.invalid/devnet-integration.json",
    },
  });
  expect(create.action).toBe("create");
  expect(create.venue).toBe("pump");
  expect(create.requiredSigners).toEqual([creator.publicKey.toBase58(), create.mint]);
  expect(create.signedBy).toEqual([create.mint]);
  expect(create.lookupTablesUsed).toEqual([]);
  await signSendAndConfirm(connection, create, creator);

  const mint = new PublicKey(create.mint);
  const createdMint = await readMint(connection, mint);
  expect(createdMint.decimals).toBe(TOKEN_DECIMALS);
  expect(createdMint.supply).toBe(BigInt(global.tokenTotalSupply.toString()));
  const initialCurve = await readCurve(connection, mint);
  expect(initialCurve.complete).toBe(false);
  expect(initialCurve.creator).toBe(creator.publicKey.toBase58());
  expect(initialCurve.tokenTotalSupply).toBe(createdMint.supply);
  expect(initialCurve.realTokenReserves).toBeGreaterThan(0n);

  const curveRoute = (await handleRequest({ method: "GET", path: `/curve/${create.mint}` }, env)) as Record<string, unknown>;
  expect(curveRoute.mint).toBe(create.mint);
  expect(curveRoute.complete).toBe(false);
  expect(curveRoute.tradesOn).toBe("pump");
  expect(curveRoute.creator).toBe(creator.publicKey.toBase58());

  const tokenProgram = createdMint.owner;
  const buyerOneAddress = tokenAddress(mint, buyerOne.publicKey, tokenProgram);
  const buyerTwoAddress = tokenAddress(mint, buyerTwo.publicKey, tokenProgram);
  expect(buyerOneAddress.equals(buyerTwoAddress)).toBe(false);
  expect(await tokenBalance(connection, mint, buyerOne.publicKey, tokenProgram)).toBe(0n);
  expect(await tokenBalance(connection, mint, buyerTwo.publicKey, tokenProgram)).toBe(0n);

  const firstBuy = await buildTrade(env, {
    publicKey: buyerOne.publicKey.toBase58(),
    action: "buy",
    mint: create.mint,
    amount: 0.01,
    denominatedInSol: true,
    slippage: 10,
    priorityFee: 0,
    pool: "pump",
  });
  expect(firstBuy.venue).toBe("pump");
  expect(firstBuy.requiredSigners).toEqual([buyerOne.publicKey.toBase58()]);
  expect(firstBuy.signedBy).toEqual([]);
  expect(firstBuy.lookupTablesUsed).toEqual([]);
  await signSendAndConfirm(connection, firstBuy, buyerOne);

  const firstReceived = await tokenBalance(connection, mint, buyerOne.publicKey, tokenProgram);
  expect(firstReceived).toBe(rawTokens(firstBuy.quote.tokensOut));
  expect(firstReceived).toBeGreaterThan(0n);
  expect(await tokenBalance(connection, mint, buyerTwo.publicKey, tokenProgram)).toBe(0n);

  const secondBuy = await buildTrade(env, {
    publicKey: buyerTwo.publicKey.toBase58(),
    action: "buy",
    mint: create.mint,
    amount: 0.02,
    denominatedInSol: true,
    slippage: 10,
    priorityFee: 0,
    pool: "pump",
  });
  expect(secondBuy.venue).toBe("pump");
  expect(secondBuy.requiredSigners).toEqual([buyerTwo.publicKey.toBase58()]);
  expect(secondBuy.signedBy).toEqual([]);
  expect(secondBuy.lookupTablesUsed).toEqual([]);
  await signSendAndConfirm(connection, secondBuy, buyerTwo);

  const secondReceived = await tokenBalance(connection, mint, buyerTwo.publicKey, tokenProgram);
  expect(secondReceived).toBe(rawTokens(secondBuy.quote.tokensOut));
  expect(secondReceived).toBeGreaterThan(0n);
  expect(await tokenBalance(connection, mint, buyerOne.publicKey, tokenProgram)).toBe(firstReceived);

  const finalMint = await readMint(connection, mint);
  const finalCurve = await readCurve(connection, mint);
  expect(finalMint.supply).toBe(createdMint.supply);
  expect(finalCurve.tokenTotalSupply).toBe(createdMint.supply);
  expect(finalCurve.complete).toBe(false);
  expect(finalCurve.realTokenReserves).toBeLessThan(initialCurve.realTokenReserves);
}, 240_000);
