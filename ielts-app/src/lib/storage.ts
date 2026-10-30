import type { TestRecord } from "../types";

// Data layer. The rest of the app depends ONLY on the `ProgressStore`
// interface, so swapping localStorage for a MongoDB-backed API later means
// writing one new class (e.g. `ApiProgressStore`) that implements this
// interface and exporting it as `store` — no page/component changes needed.

export interface ProgressStore {
  all(): Promise<TestRecord[]>;
  add(record: TestRecord): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

const KEY = "ielts.history.v1";

class LocalStorageProgressStore implements ProgressStore {
  private read(): TestRecord[] {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as TestRecord[]) : [];
    } catch {
      return [];
    }
  }

  private write(records: TestRecord[]) {
    try {
      localStorage.setItem(KEY, JSON.stringify(records));
    } catch {
      /* quota / private mode — ignore */
    }
  }

  async all(): Promise<TestRecord[]> {
    return this.read().sort((a, b) => +new Date(b.date) - +new Date(a.date));
  }

  async add(record: TestRecord): Promise<void> {
    const records = this.read();
    records.push(record);
    this.write(records);
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().filter((r) => r.id !== id));
  }

  async clear(): Promise<void> {
    this.write([]);
  }
}

// Single app-wide instance. To move to MongoDB: implement ProgressStore with
// fetch() calls to new /api/history endpoints and swap the line below.
export const store: ProgressStore = new LocalStorageProgressStore();

export function makeRecord(record: Omit<TestRecord, "id" | "date">): TestRecord {
  return {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    ...record,
  };
}
