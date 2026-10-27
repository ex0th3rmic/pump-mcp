import { getWallets } from "@wallet-standard/app";
import type { IdentifierString, Wallet, WalletAccount } from "@wallet-standard/base";
import { StandardConnect, StandardDisconnect, StandardEvents } from "@wallet-standard/features";
import { SolanaSignTransaction } from "@solana/wallet-standard-features";
import type { Health } from "./types";

type ConnectFeature = {
  connect: (input?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }>;
};

type EventsFeature = {
  on: (event: "change", listener: (properties: { accounts?: readonly WalletAccount[] }) => void) => () => void;
};

type SignFeature = {
  signTransaction: (...inputs: readonly [{
    account: WalletAccount;
    transaction: Uint8Array;
    chain?: IdentifierString;
  }]) => Promise<readonly [{ signedTransaction: Uint8Array }]>;
};

function supportsSigning(wallet: Wallet): boolean {
  return StandardConnect in wallet.features && SolanaSignTransaction in wallet.features;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

class WalletState {
  available = $state<Wallet[]>([]);
  selected = $state<Wallet | null>(null);
  account = $state<WalletAccount | null>(null);
  connecting = $state(false);
  error = $state("");
  private readonly registry = getWallets();
  private offEvents: (() => void) | null = null;

  constructor() {
    this.refresh();
    this.registry.on("register", () => this.refresh());
    this.registry.on("unregister", () => this.refresh());
  }

  private refresh(): void {
    this.available = this.registry.get().filter(supportsSigning);
    if (this.selected && !this.available.includes(this.selected)) this.clear();
  }

  private signingAccount(wallet: Wallet, accounts: readonly WalletAccount[]): WalletAccount | null {
    return accounts.find((account) => account.features.includes(SolanaSignTransaction)) ?? accounts[0] ?? null;
  }

  async connect(name: string): Promise<void> {
    const selected = this.available.find((item) => item.name === name);
    if (!selected) throw new Error("Choose a Wallet Standard-compatible wallet.");
    this.connecting = true;
    this.error = "";
    try {
      const feature = selected.features[StandardConnect] as ConnectFeature;
      const { accounts } = await feature.connect();
      const account = this.signingAccount(selected, accounts);
      if (!account) throw new Error(`${selected.name} did not provide a Solana signing account.`);
      this.offEvents?.();
      this.selected = selected;
      this.account = account;
      const events = selected.features[StandardEvents] as EventsFeature | undefined;
      this.offEvents = events?.on("change", ({ accounts: changed }) => {
        if (!changed || !this.selected) return;
        this.account = this.signingAccount(this.selected, changed);
        if (!this.account) this.clear();
      }) ?? null;
    } catch (error) {
      this.clear();
      this.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      this.connecting = false;
    }
  }

  async signTransaction(transaction: Uint8Array, cluster: Health["cluster"]): Promise<Uint8Array> {
    if (!this.selected || !this.account) throw new Error("Connect a wallet before signing.");
    const feature = this.selected.features[SolanaSignTransaction] as SignFeature | undefined;
    if (!feature) throw new Error(`${this.selected.name} does not support Solana transaction signing.`);
    const chain = (cluster === "devnet" ? "solana:devnet" : "solana:mainnet") as IdentifierString;
    const outputs = await feature.signTransaction({ account: this.account, transaction, chain });
    const signed = outputs[0]?.signedTransaction;
    if (!signed?.length) throw new Error("The wallet returned no signed transaction.");
    return signed;
  }

  async disconnect(): Promise<void> {
    const selected = this.selected;
    this.clear();
    const feature = selected?.features[StandardDisconnect] as { disconnect: () => Promise<void> } | undefined;
    await feature?.disconnect();
  }

  private clear(): void {
    this.offEvents?.();
    this.offEvents = null;
    this.selected = null;
    this.account = null;
  }
}

export const wallet = new WalletState();
