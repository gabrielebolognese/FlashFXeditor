// Imports that failed (Batch 47, spec §9.1): a file of an accepted type that could not be read (a
// corrupt MP4, a file with no track, a failed copy) stays in the Media tab as a failed entry, with a
// red badge and its reason, until it is dismissed. Session state of the open project: it is not in the
// document (no media record, so nothing can use it) and goes when the project closes.
import { createStore } from "../core/store/createStore.js";
import type { Container } from "../media/mediaKinds.js";

export interface FailedImport {
  id: string;
  name: string;
  container: Container;
  reason: string;
}

export const failedImports = createStore<readonly FailedImport[]>([]);

let nextId = 1;

/**
 * Records one import: its failures are added (a file failing again replaces its entry, keeping its
 * place) and files that imported this time drop theirs.
 */
export function recordImport(failed: readonly Omit<FailedImport, "id">[], imported: readonly string[]): void {
  if (failed.length === 0 && imported.length === 0) return;
  failedImports.set((current) => {
    const done = new Set(imported);
    const next = current.filter((entry) => !done.has(entry.name));
    for (const entry of failed) {
      const at = next.findIndex((known) => known.name === entry.name);
      const record = { ...entry, id: `failed-${nextId++}` };
      if (at === -1) next.push(record);
      else next[at] = record;
    }
    return next.length === current.length && next.every((entry, i) => entry === current[i]) ? current : next;
  });
}

/** Dismisses one failed import, or all of them without an id. */
export function dismissFailedImport(id?: string): void {
  failedImports.set((current) => {
    const next = id === undefined ? [] : current.filter((entry) => entry.id !== id);
    return next.length === current.length ? current : next;
  });
}
