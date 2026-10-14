// Key-value persistence for directory handles and global settings (spec §3.1: idb-keyval).
import { createStore as createIdbStore, del, get, set } from "idb-keyval";

export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

/** IndexedDB database "shorts-editor", object store "kv". Values are structured clones. */
export function idbKeyValueStore(): KeyValueStore {
  const store = createIdbStore("shorts-editor", "kv");
  return {
    get: (key) => get(key, store),
    set: (key, value) => set(key, value, store),
    del: (key) => del(key, store),
  };
}

/** For tests. Values are kept by reference: test handles are class instances a clone would strip. */
export function memoryKeyValueStore(): KeyValueStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (key) => data.get(key),
    set: async (key, value) => void data.set(key, value),
    del: async (key) => void data.delete(key),
  };
}
