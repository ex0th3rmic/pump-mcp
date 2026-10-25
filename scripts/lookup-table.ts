/**
 * Creates the address lookup table that lets /trade fit create + dev buy in one transaction.
 * Run once per deployment, by the operator, with the operator's own wallet.
 *
 *   bun run lookup-table --authority <pubkey>              print the unsigned transactions; sign them elsewhere
 *   bun run lookup-table --keypair <keypair.json>          show the plan and the cost, send nothing
 *   bun run lookup-table --keypair <keypair.json> --yes    sign with that wallet and send
 *
 * RPC_URL comes from the environment or .dev.vars. The wallet pays rent for the table (about 0.01 SOL
 * for ~40 addresses) and becomes its authority. Afterwards set LOOKUP_TABLES in wrangler.toml.
 */
import { readFileSync, existsSync } from "node:fs";
import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { OnlinePumpSdk } from "@pump-fun/pump-sdk";
import { lookupTableTransactions, pumpLookupAddresses } from "../src/lookup";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function rpcUrl(): string {
  if (process.env.RPC_URL) return process.env.RPC_URL;
  if (existsSync(".dev.vars")) {
    const line = readFileSync(".dev.vars", "utf8").split("\n").find((l) => l.startsWith("RPC_URL="));
    if (line) return line.slice("RPC_URL=".length).trim();
  }
  throw new Error("set RPC_URL (environment or .dev.vars)");
}

const keypairPath = arg("keypair");
const authorityArg = arg("authority");
const send = process.argv.includes("--yes");
if (!keypairPath && !authorityArg) {
  console.error("usage: bun run lookup-table --authority <pubkey> | --keypair <keypair.json> [--yes]");
  process.exit(1);
}
const signer = keypairPath ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath.replace(/^~/, process.env.HOME ?? "~"), "utf8")))) : null;
const authority = signer ? signer.publicKey : new PublicKey(authorityArg!);

const connection = new Connection(rpcUrl(), "confirmed");
const addresses = await pumpLookupAddresses(await new OnlinePumpSdk(connection).fetchGlobal());
const recentSlot = await connection.getSlot("finalized");
const { blockhash } = await connection.getLatestBlockhash("confirmed");
const { tableAddress, transactions } = lookupTableTransactions({ authority, recentSlot, blockhash, addresses });
const rent = await connection.getMinimumBalanceForRentExemption(56 + 32 * addresses.length);
const balance = await connection.getBalance(authority);

console.log(`table address  ${tableAddress.toBase58()}`);
console.log(`authority      ${authority.toBase58()} (pays, and can extend or close the table)`);
console.log(`addresses      ${addresses.length}`);
console.log(`transactions   ${transactions.length}`);
console.log(`cost           ~${(rent / 1e9).toFixed(5)} SOL rent + fees; wallet holds ${(balance / 1e9).toFixed(5)} SOL`);

if (!signer) {
  console.log("\nunsigned transactions (base64, send in order):");
  transactions.forEach((t, i) => console.log(`${i + 1}. ${t}`));
  process.exit(0);
}
if (!send) {
  console.log("\nnothing sent. Re-run with --yes to sign with this wallet and send.");
  process.exit(0);
}
for (const [i, b64] of transactions.entries()) {
  const tx = VersionedTransaction.deserialize(Buffer.from(b64, "base64"));
  tx.sign([signer]);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight: (await connection.getLatestBlockhash("confirmed")).lastValidBlockHeight }, "confirmed");
  console.log(`sent ${i + 1}/${transactions.length}: ${sig}`);
}
console.log(`\ndone. In wrangler.toml under [vars] set:\nLOOKUP_TABLES = "${tableAddress.toBase58()}"\nthen bun run deploy.`);
