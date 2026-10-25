import { describe, expect, test } from "bun:test";
import { AddressLookupTableProgram, Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { OnlinePumpSdk, bondingCurvePda } from "@pump-fun/pump-sdk";
import { lookupTableTransactions, pumpLookupAddresses } from "../src/lookup";
import { cassette } from "./support/rpc-cassette";

const tape = cassette("tx-mainnet");
const connection = new Connection("https://rpc.invalid", { commitment: "confirmed", fetch: tape.fetchImpl as unknown as typeof fetch });

describe("pumpLookupAddresses", () => {
  test("holds pump.fun's fixed accounts and every fee recipient, but nothing tied to one mint or one creator", async () => {
    const global = await new OnlinePumpSdk(connection).fetchGlobal();
    const addrs = (await pumpLookupAddresses(global)).map((k) => k.toBase58());
    expect(addrs).toContain("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"); // pump program
    expect(addrs).toContain("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"); // token-2022
    expect(addrs).toContain("ComputeBudget111111111111111111111111111111");
    for (const r of global.feeRecipients ?? []) if (!r.equals(PublicKey.default)) expect(addrs).toContain(r.toBase58());
    expect(addrs).not.toContain(PublicKey.default.toBase58());
    expect(new Set(addrs).size).toBe(addrs.length);
    expect(addrs.length).toBeLessThanOrEqual(256);
    // a fresh mint's curve can't be in a shared table
    expect(addrs).not.toContain(bondingCurvePda(Keypair.generate().publicKey).toBase58());
  });
});

describe("lookupTableTransactions", () => {
  test("creates the table owned by the operator and extends it with every address, each tx within size", async () => {
    const authority = Keypair.generate().publicKey;
    const global = await new OnlinePumpSdk(connection).fetchGlobal();
    const addresses = await pumpLookupAddresses(global);
    const { tableAddress, transactions } = lookupTableTransactions({ authority, recentSlot: 380_000_000, blockhash: "11111111111111111111111111111111", addresses });
    const [, expected] = AddressLookupTableProgram.createLookupTable({ authority, payer: authority, recentSlot: 380_000_000 });
    expect(tableAddress.equals(expected)).toBe(true);
    const seen = new Set<string>();
    transactions.forEach((b64, i) => {
      const tx = VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
      expect(tx.serialize().length).toBeLessThanOrEqual(1232);
      expect(tx.message.staticAccountKeys[0]!.equals(authority)).toBe(true);
      const keys = tx.message.staticAccountKeys;
      for (const ix of tx.message.compiledInstructions) {
        expect(keys[ix.programIdIndex]!.equals(AddressLookupTableProgram.programId)).toBe(true);
        // extend data: u32 tag (2) + u64 count + 32-byte addresses
        const data = Buffer.from(ix.data);
        if (data.readUInt32LE(0) === 2) for (let o = 12; o < data.length; o += 32) seen.add(new PublicKey(data.subarray(o, o + 32)).toBase58());
      }
      if (i === 0) expect(Buffer.from(tx.message.compiledInstructions[0]!.data).readUInt32LE(0)).toBe(0); // create first
    });
    expect([...seen].sort()).toEqual(addresses.map((a) => a.toBase58()).sort());
  });
});
