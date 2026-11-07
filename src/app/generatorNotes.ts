// The generator's notes (spec §21.4, Batch 56): FALLBACKS.md and OPEN.txt in the project folder, shown read-only
// in the Project section when present. The editor never writes them.
import { createStore } from "../core/store/createStore.js";
import type { FsDir } from "../project/fs.js";

export const GENERATOR_NOTE_FILES = ["FALLBACKS.md", "OPEN.txt"] as const;
/** Notes longer than this are cut (a generator's list of layers, not a document). */
const MAX_NOTE_CHARS = 20_000;

export interface GeneratorNote {
  name: string;
  text: string;
}

export const generatorNotes = createStore<readonly GeneratorNote[]>([]);

/** Reads the notes of a project folder; a missing or unreadable file is left out. */
export async function readGeneratorNotes(dir: FsDir): Promise<GeneratorNote[]> {
  const notes: GeneratorNote[] = [];
  for (const name of GENERATOR_NOTE_FILES) {
    try {
      const file = await dir.readFile(name);
      if (file && file.text.trim() !== "") notes.push({ name, text: file.text.length > MAX_NOTE_CHARS ? `${file.text.slice(0, MAX_NOTE_CHARS)}\n…` : file.text });
    } catch (error) {
      console.warn(`[project] cannot read ${name}`, error);
    }
  }
  return notes;
}

/** Loads the notes of the project folder that just opened (the Project section shows them). */
export function loadGeneratorNotes(dir: FsDir): void {
  generatorNotes.set([]);
  void readGeneratorNotes(dir).then((notes) => generatorNotes.set(notes));
}

export function clearGeneratorNotes(): void {
  generatorNotes.set([]);
}
