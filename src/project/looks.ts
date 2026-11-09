// Looks (spec §21.19, Batch 75): an effect stack saved by name in the global store (IndexedDB, next to the
// templates), applied to the selected clips in one click. A look keeps its effects' parameters (not their
// keys) and the text of the LUT files they name, so it applies in any project: the files are copied into
// that project's `luts/` when missing.
import { createStore, type Store } from "../core/store/createStore.js";
import type { Effect } from "../core/document/types.js";
import { effectFilePaths, effectIssues } from "../core/effects/effectParams.js";
import { parseCube } from "../core/effects/lut.js";
import type { KeyValueStore } from "./kv.js";

export interface Look {
  id: string;
  name: string;
  /** ISO time it was saved. */
  createdAt: string;
  /** The stack, in order (base parameters; keys are not kept). */
  effects: Effect[];
  /** The `.cube` text of each LUT file the effects name, by project path. */
  luts: Record<string, string>;
}

export const MAX_LOOKS = 50;
export const MAX_LOOK_NAME = 40;
const KEY = "looks.v1";

/** Trimmed, one line, capped; empty names become null. */
export function cleanLookName(name: string): string | null {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, MAX_LOOK_NAME);
  return clean === "" ? null : clean;
}

/** "Look 3": the first free "Look <n>" among `taken` (compared without case). */
export function nextLookName(taken: readonly string[]): string {
  const used = new Set(taken.map((name) => name.toLowerCase()));
  let n = 1;
  while (used.has(`look ${n}`)) n += 1;
  return `Look ${n}`;
}

/**
 * A look of `effects` (deep copies; ids kept), with the text of each LUT they name (`lutText`; a LUT whose text
 * is unknown is left out, and its effect then draws nothing where the file is missing). Null for an empty stack.
 */
export function lookFromEffects(effects: readonly Effect[], fields: { id: string; name: string; now: string }, lutText: (path: string) => string | null): Look | null {
  if (effects.length === 0) return null;
  const luts: Record<string, string> = {};
  for (const path of effectFilePaths(effects)) {
    const text = lutText(path);
    if (text !== null) luts[path] = text;
  }
  return { id: fields.id, name: cleanLookName(fields.name) ?? "Look", createdAt: fields.now, effects: structuredClone([...effects]), luts };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** A stored look whose effects pass the validator and whose LUT texts parse; null otherwise. */
export function sanitizeLook(value: unknown, now: string): Look | null {
  if (!isRecord(value) || typeof value.id !== "string" || value.id === "" || typeof value.name !== "string" || !Array.isArray(value.effects) || value.effects.length === 0) return null;
  const name = cleanLookName(value.name);
  if (!name || effectIssues(value.effects, "look").length > 0) return null;
  const luts: Record<string, string> = {};
  if (isRecord(value.luts)) {
    for (const [path, text] of Object.entries(value.luts)) if (typeof text === "string" && parseCube(text)) luts[path] = text;
  }
  return { id: value.id, name, createdAt: typeof value.createdAt === "string" ? value.createdAt : now, effects: structuredClone(value.effects as Effect[]), luts };
}

/** The looks in IndexedDB, newest first. */
export class LookStore {
  readonly list: Store<readonly Look[]> = createStore<readonly Look[]>([]);
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly kv: KeyValueStore) {}

  async load(now = new Date().toISOString()): Promise<void> {
    try {
      const stored = await this.kv.get(KEY);
      const looks = Array.isArray(stored) ? stored.map((value) => sanitizeLook(value, now)).filter((look): look is Look => look !== null) : [];
      this.list.set(looks.slice(0, MAX_LOOKS));
    } catch (error) {
      console.warn("[looks] could not read looks", error);
    }
  }

  /** Adds a look first; a look with the same name is replaced. */
  save(look: Look): Promise<void> {
    const others = this.list.getState().filter((other) => other.id !== look.id && other.name.toLowerCase() !== look.name.toLowerCase());
    this.list.set([look, ...others].slice(0, MAX_LOOKS));
    return this.persist();
  }

  remove(id: string): Promise<void> {
    if (!this.list.getState().some((look) => look.id === id)) return this.writing;
    this.list.set(this.list.getState().filter((look) => look.id !== id));
    return this.persist();
  }

  find(id: string): Look | null {
    return this.list.getState().find((look) => look.id === id) ?? null;
  }

  private persist(): Promise<void> {
    this.writing = this.writing.then(async () => {
      try {
        await this.kv.set(KEY, this.list.getState());
      } catch (error) {
        console.warn("[looks] could not store looks", error);
      }
    });
    return this.writing;
  }
}
