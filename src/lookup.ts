/**
 * The address lookup table that lets `create_v2` + dev buy fit in one transaction.
 *
 * A create with a dev buy references ~33 accounts, more than Solana's 1232-byte limit allows inline.
 * Most of them are the same for every coin (pump.fun's programs, PDAs, fee recipients); listing those
 * in a lookup table the operator owns brings the transaction to ~930 bytes. Lookup tables are
 * append-only, so entries can never be swapped out from under a signed transaction.
 */
import { AddressLookupTableProgram, ComputeBudgetProgram, Keypair, PublicKey, TransactionMessage, VersionedTransaction, type TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import { PUMP_SDK, type Global } from "@pump-fun/pump-sdk";

/** Every account a create_v2 + buy references for any mint and any creator, plus every fee recipient `Global` may route a trade to. */
export async function pumpLookupAddresses(global: Global): Promise<PublicKey[]> {
  const sample = async () => {
    const mint = Keypair.generate().publicKey;
    const user = Keypair.generate().publicKey;
    const ixs = await PUMP_SDK.createV2AndBuyV2Instructions({
      global, mint, name: "x", symbol: "X", uri: "https://x.invalid", creator: user, user,
      amount: new BN(1_000_000), quoteAmount: new BN(1_000_000), mayhemMode: false, slippage: 1,
    });
    const keys = new Set<string>();
    for (const ix of ixs) {
      keys.add(ix.programId.toBase58());
      for (const k of ix.keys) keys.add(k.pubkey.toBase58());
    }
    return keys;
  };
  // Accounts present for three unrelated mints and creators are the fixed ones.
  const [a, b, c] = await Promise.all([sample(), sample(), sample()]);
  const fixed = [...a].filter((k) => b.has(k) && c.has(k));
  // Fee recipients are picked at random per trade, so list all of them.
  const g = global as Global & Record<string, unknown>;
  const recipients = [g.feeRecipient, ...(g.feeRecipients ?? []), g.reservedFeeRecipient, ...((g.reservedFeeRecipients as PublicKey[] | undefined) ?? []), ...((g.buybackFeeRecipients as PublicKey[] | undefined) ?? [])]
    .filter((k): k is PublicKey => k instanceof PublicKey)
    .map((k) => k.toBase58());
  const all = new Set([...fixed, ...recipients, ComputeBudgetProgram.programId.toBase58()]);
  all.delete(PublicKey.default.toBase58());
  return [...all].sort().map((k) => new PublicKey(k));
}

/**
 * Unsigned transactions that create a lookup table owned (and paid for) by `authority`, then extend
 * it with `addresses`. Send them in order; the table is usable one slot after the last one lands.
 */
export function lookupTableTransactions(o: { authority: PublicKey; recentSlot: number; blockhash: string; addresses: PublicKey[] }): {
  tableAddress: PublicKey;
  transactions: string[];
} {
  const [createIx, tableAddress] = AddressLookupTableProgram.createLookupTable({ authority: o.authority, payer: o.authority, recentSlot: o.recentSlot });
  const extend = (addresses: PublicKey[]) =>
    AddressLookupTableProgram.extendLookupTable({ payer: o.authority, authority: o.authority, lookupTable: tableAddress, addresses });
  const tx = (ixs: TransactionInstruction[]) =>
    Buffer.from(new VersionedTransaction(new TransactionMessage({ payerKey: o.authority, recentBlockhash: o.blockhash, instructions: ixs }).compileToV0Message()).serialize()).toString("base64");

  const FIRST = 20; // the create instruction shares the first transaction
  const CHUNK = 28;
  const transactions = [tx([createIx, extend(o.addresses.slice(0, FIRST))])];
  for (let i = FIRST; i < o.addresses.length; i += CHUNK) transactions.push(tx([extend(o.addresses.slice(i, i + CHUNK))]));
  return { tableAddress, transactions };
}
