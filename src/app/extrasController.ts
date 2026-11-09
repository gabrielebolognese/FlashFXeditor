// The export extras of Batch 81 (spec §21.25) that are not one render job: audio stems (one WAV per
// audio track), Collect project (copies linked media into the project folder) and the project zip.
// Each reads the open project, writes under exports/ (or media/ for a collect) and ends in a toast.
import { sourceFile } from "./mediaOffline.js";
import { relinkMedia } from "../core/commands/mediaCommands.js";
import type { Project } from "../core/document/types.js";
import { EXPORTS_DIR, ExportFile } from "../export/exportFile.js";
import { stemFileName, stemsOf, STEMS_SUFFIX, wavFile } from "../export/stems.js";
import { collectSummary, inProjectZip, linkedMedia, linkedSequences, zipEntryPath } from "../project/collect.js";
import { formatBytes } from "../project/cache.js";
import { errorMessage } from "../project/errorMessage.js";
import type { FsDir } from "../project/fs.js";
import { subdir } from "../project/layout.js";
import { copyIntoMedia, MEDIA_DIR, safeFileName, takenNames, uniqueName } from "../project/mediaFiles.js";
import { ZipTooLargeError, ZipWriter } from "../project/zip.js";
import { contentEnd } from "../timeline/model/queries.js";
import { dismissToast, showToast } from "../ui/toasts.js";
import { exportRange, mixdown } from "./exportController.js";
import { currentSession, refuseReadOnly } from "./projectController.js";
import { actions, documentStore } from "./services.js";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One extra at a time: a second click while one runs does nothing. */
let busy = false;

async function guarded(label: string, run: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = true;
  const toast = showToast({ tone: "info", message: `${label}…` }, { durationMs: null });
  try {
    await run();
  } catch (error) {
    console.error(`[export] ${label} failed`, error);
    showToast({ tone: "error", message: `${label} failed`, detail: error instanceof ZipTooLargeError ? `${errorMessage(error)}. Zip the folder with another tool instead.` : errorMessage(error) });
  } finally {
    busy = false;
    dismissToast(toast);
  }
}

/** Export stems: one WAV per audible audio track, over the export range, into exports/<project>-stems/. */
export async function exportStems(project: Project = documentStore.getRoot()): Promise<void> {
  const session = currentSession();
  if (!session) return;
  if (session.readOnly) return refuseReadOnly("export into the project folder");
  const stems = stemsOf(project);
  if (stems.length === 0) {
    showToast({ tone: "info", message: "No stems to export", detail: "No audible audio track holds a clip." });
    return;
  }
  const range = exportRange(project) ?? { start: 0, end: contentEnd(project) };
  if (range.end <= range.start) {
    showToast({ tone: "info", message: "Nothing to export", detail: "Add clips to the timeline first." });
    return;
  }
  await guarded("Exporting stems", async () => {
    const exportsDir = await subdir(session.dir, EXPORTS_DIR);
    const folderName = uniqueName(await takenNames(exportsDir), safeFileName(`${project.name}${STEMS_SUFFIX}`));
    const folder = await subdir(exportsDir, folderName);
    const controller = new AbortController();
    let written = 0;
    let bytes = 0;
    for (const [index, stem] of stems.entries()) {
      const mix = await mixdown(stem.project, range, controller.signal);
      if (!mix) continue;
      const planes = mix.channels.map((buffer) => new Float32Array(buffer));
      const file = wavFile(planes, planes.length, mix.sampleRate, planes[0]?.length ?? 0);
      await folder.writeFile(stemFileName(index, safeFileName(stem.name), stems.length), new Blob([file as Uint8Array<ArrayBuffer>]));
      written++;
      bytes += file.length;
    }
    showToast({ tone: "success", message: `Saved ${plural(written, "stem")}`, detail: `${EXPORTS_DIR}/${folderName}/ · ${formatBytes(bytes)} · WAV 16-bit 48 kHz` }, { durationMs: 8000 });
  });
}

/** Collect project: copies the media linked outside the project folder into media/ and points the project at the copies (one undo step). */
export async function collectProject(): Promise<void> {
  const session = currentSession();
  if (!session) return;
  if (session.readOnly) return refuseReadOnly("copy media into the project folder");
  await guarded("Collecting the project", async () => {
    const media = documentStore.getState().media;
    const taken = await takenNames(await subdir(session.dir, MEDIA_DIR));
    const entries: { id: string; fields: { file: { relPath: string } } }[] = [];
    let failed = 0;
    for (const item of linkedMedia(media)) {
      try {
        const file = await sourceFile(item.id);
        if (!file) throw new Error("offline");
        entries.push({ id: item.id, fields: { file: { relPath: await copyIntoMedia(session.dir, file, file.name, taken) } } });
      } catch {
        failed++;
      }
    }
    if (entries.length > 0) documentStore.dispatch(relinkMedia(entries));
    const skipped = linkedSequences(media).length;
    showToast({ tone: failed > 0 ? "info" : "success", message: "Collected the project", detail: collectSummary(entries.length, skipped, failed) }, { durationMs: 8000 });
  });
}

/** Every file under `dir` as project-relative paths, the excluded top-level entries skipped. */
async function* walk(dir: FsDir, prefix = ""): AsyncGenerator<{ path: string; dir: FsDir; name: string }> {
  for (const entry of await dir.list()) {
    const path = `${prefix}${entry.name}`;
    if (!inProjectZip(path)) continue;
    if (entry.kind === "directory") {
      const child = await dir.dir(entry.name);
      if (child) yield* walk(child, `${path}/`);
    } else yield { path, dir, name: entry.name };
  }
}

/** Zip project: the project folder (without caches, history and exports) as a store-only zip in exports/. */
export async function zipProject(): Promise<void> {
  const session = currentSession();
  if (!session) return;
  if (session.readOnly) return refuseReadOnly("export into the project folder");
  const project = documentStore.getRoot();
  await guarded("Zipping the project", async () => {
    const root = safeFileName(project.name);
    const output = await ExportFile.create(session.dir, crypto.randomUUID(), (error) => console.error("[export] zip write failed", error), "zip");
    try {
      let position = 0;
      const zip = new ZipWriter((data) => {
        output.write(data, position);
        position += data.length;
      });
      for await (const { path, dir, name } of walk(session.dir)) {
        const file = await dir.getFile(name);
        if (file) await zip.addFile(zipEntryPath(root, path), file, new Date(file.lastModified));
      }
      await zip.finish();
      const name = await output.finish(`${root}.zip`);
      showToast({ tone: "success", message: `Saved ${name}`, detail: `${EXPORTS_DIR}/${name} · ${formatBytes(output.bytes)} · ${plural(zip.count, "file")}` }, { durationMs: 8000 });
    } catch (error) {
      await output.discard();
      throw error;
    }
  });
}

/** Registers the extras' commands. Returns a stop function. */
export function installExtrasController(): () => void {
  const stops = [actions.register("export.stems", () => void exportStems()), actions.register("export.collect", () => void collectProject()), actions.register("export.zip", () => void zipProject())];
  return () => stops.forEach((stop) => stop());
}
