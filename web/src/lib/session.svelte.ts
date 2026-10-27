import { mcp, normalizeToken } from "./mcp";
import type { Health } from "./types";

const SESSION_KEY = "pump-mcp-session-token";
const LEGACY_KEY = "pump-mcp-token";

class SessionState {
  token = $state("");
  health = $state<Health | null>(null);
  healthError = $state("");
  connecting = $state(false);
  selectedMint = $state("");

  constructor() {
    try {
      const legacy = window.localStorage.getItem(LEGACY_KEY);
      this.token = window.sessionStorage.getItem(SESSION_KEY) ?? legacy ?? "";
      if (this.token) window.sessionStorage.setItem(SESSION_KEY, this.token);
      window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      // Storage can be unavailable in privacy modes; in-memory state still works.
    }
    void this.refreshHealth();
  }

  setToken(raw: string): string {
    const normalized = normalizeToken(raw);
    if (normalized !== this.token) mcp.reset();
    this.token = normalized;
    try {
      if (normalized) window.sessionStorage.setItem(SESSION_KEY, normalized);
      else window.sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Keep the credential in memory when storage is blocked.
    }
    return normalized;
  }

  async unlock(raw: string): Promise<void> {
    const normalized = this.setToken(raw);
    if (!normalized) throw new Error("Enter the bearer token first.");
    this.connecting = true;
    try {
      await mcp.initialize(normalized);
    } catch (error) {
      this.lock();
      throw error;
    } finally {
      this.connecting = false;
    }
  }

  lock(): void {
    mcp.reset();
    this.token = "";
    this.selectedMint = "";
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
      window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      // The in-memory credential is still cleared.
    }
  }

  async refreshHealth(): Promise<void> {
    this.healthError = "";
    try {
      const response = await fetch("/health");
      if (!response.ok) throw new Error(`Health check returned ${response.status}`);
      this.health = await response.json() as Health;
    } catch (error) {
      this.health = null;
      this.healthError = error instanceof Error ? error.message : String(error);
    }
  }
}

export const session = new SessionState();
