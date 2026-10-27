export interface ActivityItem {
  id: number;
  label: string;
  at: string;
  status: "running" | "success" | "error";
  ms?: number;
  mint?: string;
  signature?: string;
}

class ActivityState {
  items = $state<ActivityItem[]>([]);
  private nextId = 1;

  start(label: string, mint?: string): number {
    const id = this.nextId++;
    this.items.unshift({ id, label, at: new Date().toISOString(), status: "running", mint });
    return id;
  }

  finish(id: number, status: "success" | "error", ms: number, details: { mint?: string; signature?: string } = {}): void {
    const item = this.items.find((entry) => entry.id === id);
    if (item) Object.assign(item, { status, ms: Math.round(ms), ...details });
  }

  clear(): void {
    this.items = [];
  }
}

export const activity = new ActivityState();
