// Import words (spec §21.8, Batch 59): `captions.importWords` on the Captions tab. A JSON file of word
// timings (`text/wordsImport.ts`) becomes cues: with the file's own `cues` list exactly those, else the
// chunking dialog's rules (max words per cue, characters per line, lines, breaks at punctuation and at
// pauses) decide. The cues go through the transcript review (nothing is replaced before the user
// confirms), then onto the caption track in one undo step "Import words".
import { documentStore } from "./services.js";
import { errorMessage } from "../project/errorMessage.js";
import { cuesInRange, transcribedCues } from "../timeline/edit/captions.js";
import { DEFAULT_CHUNKS, parseWordsJson, wordsToCues, WordsImportError, type ChunkOptions, type ImportedWords } from "../text/wordsImport.js";
import { showToast } from "../ui/toasts.js";
import { pickFile, type PickerType } from "./filePickers.js";
import { transcription, wordsImportDialog } from "./transcription.js";
import { actions } from "./services.js";

const WORDS_TYPES: readonly PickerType[] = [{ description: "Words (JSON)", accept: { "application/json": [".json"] } }];

/** The cues of `imported` for the open project, shown in the review before they replace anything. */
export function reviewImportedWords(imported: ImportedWords, options: ChunkOptions, fileName: string): void {
  const project = documentStore.getState();
  const cues = transcribedCues(wordsToCues(imported, options), { start: 0, end: Number.MAX_SAFE_INTEGER }, project.settings.fps);
  const first = cues[0];
  const last = cues[cues.length - 1];
  if (!first || !last) {
    showToast({ tone: "info", message: "No captions to import", detail: "The words made no cue." });
    return;
  }
  const range = { start: first.start, end: last.start + last.duration };
  wordsImportDialog.set(null);
  transcription.set({
    kind: "review",
    review: { projectId: project.id, range, cues, language: null, model: null, device: null, source: { fileName }, words: imported.words.length, replaced: cuesInRange(project, range).length },
  });
}

/** Reads a words file's text and goes on: the review at once with the file's chunks, else the chunking dialog. */
export function importWordsText(text: string, fileName: string): void {
  try {
    const imported = parseWordsJson(text);
    if (imported.cues) reviewImportedWords(imported, DEFAULT_CHUNKS, fileName);
    else wordsImportDialog.set({ fileName, imported, options: { ...DEFAULT_CHUNKS } });
  } catch (error) {
    showToast({ tone: "error", message: "Couldn't import the words", detail: error instanceof WordsImportError ? error.message : errorMessage(error) });
  }
}

/** The command: pick a JSON file and import its words. */
export async function importWords(file?: File): Promise<void> {
  try {
    const picked = file ?? (await pickFile(WORDS_TYPES));
    if (picked) importWordsText(await picked.text(), picked.name);
  } catch (error) {
    showToast({ tone: "error", message: "Couldn't import the words", detail: errorMessage(error) });
  }
}

export function closeWordsImportDialog(): void {
  wordsImportDialog.set(null);
}

/** Registers `captions.importWords`. Returns a stop function. */
export function installWordsImportController(): () => void {
  const stops = [actions.register("captions.importWords", () => void importWords())];
  let projectId = documentStore.getState().id;
  stops.push(
    documentStore.subscribe((project) => {
      if (project.id === projectId) return;
      projectId = project.id;
      closeWordsImportDialog();
    }),
  );
  if (import.meta.env.DEV) {
    const editor = ((globalThis as { __editor?: Record<string, unknown> }).__editor ??= {});
    editor.words = { importText: importWordsText, state: () => wordsImportDialog.getState() };
  }
  return () => {
    for (const stop of stops) stop();
    closeWordsImportDialog();
  };
}
