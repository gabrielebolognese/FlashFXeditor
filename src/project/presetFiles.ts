// Preset folders (spec §10.3, §9.7): a project's `presets/text/` and the user's library folder hold
// one JSON file per preset (`<id>.json`, text/presets.ts `formatPresetFile`). Reading skips files that
// are not presets; writing mirrors a list of presets into the folder, writing only the presets whose
// version changed since the last write and removing the files of presets that left the list.
import type { TextPreset } from "../core/document/types.js";
import { formatPresetFile, presetFileName, sanitizePreset } from "../text/presets.js";
import type { FsDir } from "./fs.js";

/** A project's preset folder: `presets/text/`. */
export const PRESETS_DIR = "presets";
export const TEXT_PRESETS_DIR = "text";

/** `<project>/presets/text/`, created when `create` (null when it does not exist). */
export async function projectPresetsDir(root: FsDir, create: boolean): Promise<FsDir | null> {
  const presets = await root.dir(PRESETS_DIR, { create });
  return presets ? presets.dir(TEXT_PRESETS_DIR, { create }) : null;
}

/** The presets of a folder (`*.json` files; files that are not presets are skipped). A preset in two files keeps its newer copy. */
export async function readPresetFolder(dir: FsDir, now: string): Promise<{ presets: TextPreset[]; skipped: number }> {
  const byId = new Map<string, TextPreset>();
  let skipped = 0;
  for (const entry of await dir.list()) {
    if (entry.kind !== "file" || !entry.name.toLowerCase().endsWith(".json")) continue;
    const file = await dir.readFile(entry.name);
    let preset: TextPreset | null = null;
    try {
      preset = file ? sanitizePreset(JSON.parse(file.text), now) : null;
    } catch {
      preset = null;
    }
    if (!preset) {
      skipped += 1;
      continue;
    }
    const known = byId.get(preset.id);
    if (!known || preset.updatedAt > known.updatedAt) byId.set(preset.id, preset);
  }
  return { presets: [...byId.values()], skipped };
}

/**
 * Keeps a folder equal to a list of presets: `write` writes the presets whose `updatedAt` differs from
 * the version last written (or read) and removes the files of the ones no longer listed. Writes run one
 * at a time, in call order.
 */
export class PresetFolderWriter {
  /** id -> the `updatedAt` the folder holds. */
  private readonly written = new Map<string, string>();
  private queue: Promise<void> = Promise.resolve();

  constructor(readonly dir: FsDir) {}

  /** Records what the folder holds (after a read), so those presets are not written again. */
  know(presets: readonly TextPreset[]): void {
    for (const preset of presets) this.written.set(preset.id, preset.updatedAt);
  }

  /** Mirrors `presets` into the folder. Resolves when this write is done; failures reject it (later writes still run). */
  write(presets: readonly TextPreset[]): Promise<void> {
    const snapshot = [...presets];
    const run = this.queue.then(() => this.apply(snapshot));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async apply(presets: readonly TextPreset[]): Promise<void> {
    const ids = new Set(presets.map((preset) => preset.id));
    for (const preset of presets) {
      if (this.written.get(preset.id) === preset.updatedAt) continue;
      await this.dir.writeText(presetFileName(preset.id), formatPresetFile(preset));
      this.written.set(preset.id, preset.updatedAt);
    }
    for (const id of [...this.written.keys()]) {
      if (ids.has(id)) continue;
      await this.dir.remove(presetFileName(id));
      this.written.delete(id);
    }
  }
}