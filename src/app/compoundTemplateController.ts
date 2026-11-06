// Compound templates in the app (spec §21.24, Batch 80): Save as template (the sequence, its media and fonts go into the
// global store and the library folder), and Insert (the files are copied into the open project, the sequence is added
// with fresh ids, an instance is placed at the playhead: one undo step). Sharing and a marketplace are not built.
import { hostSequenceOf } from "../core/document/sequences.js";
import { EXPOSABLE_FIELDS, exposeParam, exposeProblem, resetInstanceValues } from "../timeline/edit/templates.js";
import type { MediaId, MediaItem, SequenceId } from "../core/document/types.js";
import { collectBundle, compoundTemplate, compoundTemplateProblem, instantiateBundle, insertBundleCommand, nextCompoundTemplateName, cleanCompoundTemplateName, cleanCategory, type CompoundTemplate } from "../project/compoundTemplates.js";
import { emptyFiles, readTemplateFolder, removeTemplateFolder, writeTemplateFolder, type TemplateFiles } from "../project/compoundTemplateStore.js";
import { drawCompoundPoster } from "../timeline/view/compoundPoster.js";
import { showToast } from "../ui/toasts.js";
import { placeCompoundAtPlayhead } from "./dropController.js";
import { exportFontFaces } from "./fontController.js";
import { importMediaFiles } from "./mediaController.js";
import { libraryFolderDir } from "./presetController.js";
import { openMediaFile } from "./previewController.js";
import { actions, compoundTemplateStore, documentStore, sessionStore, themeBridge } from "./services.js";
import { addFontFiles } from "./userFontsController.js";

const newId = () => crypto.randomUUID();
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

const THUMB_W = 320;
const THUMB_H = 180;

/** A PNG data URL of the sequence's first frame (media stay placeholders); null when no canvas is available. */
function thumbnail(sequenceId: SequenceId): string | null {
  try {
    const project = documentStore.getRoot();
    const sequence = project.sequences[sequenceId];
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext("2d");
    if (!sequence || !ctx) return null;
    const { theme } = themeBridge;
    drawCompoundPoster(ctx, project, sequence, 0, { x: 0, y: 0, w: THUMB_W, h: THUMB_H }, () => null, { backdrop: theme.color.surface3, placeholder: theme.color.surface5 });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** The media files and font faces a bundle needs, read from the open project. */
async function gatherFiles(media: Record<MediaId, MediaItem>, families: readonly string[]): Promise<TemplateFiles> {
  const files = emptyFiles();
  for (const [id, item] of Object.entries(media)) {
    const file = await openMediaFile(id).catch(() => null);
    if (file) files.media[id] = { name: item.name || file.name, blob: file };
  }
  const faces = await exportFontFaces(families.map((fontFamily) => ({ fontFamily, fontWeight: 400, italic: false }))).catch(() => []);
  const taken = new Set<string>();
  for (const face of faces) {
    if (!face.data || face.data.byteLength === 0) continue;
    const name = `${face.family}-${face.weight.replace(/\s+/g, "-")}${face.style === "italic" ? "-italic" : ""}.ttf`;
    if (taken.has(name)) continue;
    taken.add(name);
    files.fonts.push({ name, blob: new Blob([face.data]) });
  }
  return files;
}

/** Saves sequence `sequenceId` as a template; returns it, or null (with a toast) when it cannot be one. */
export async function saveSequenceAsTemplate(sequenceId: SequenceId, fields: { name?: string; category?: string } = {}): Promise<CompoundTemplate | null> {
  const project = documentStore.getRoot();
  const problem = compoundTemplateProblem(project, sequenceId);
  const bundle = problem ? null : collectBundle(project, sequenceId);
  if (!bundle) {
    showToast({ tone: "warning", message: "Can't save as a template", detail: problem ?? "The sequence cannot be collected." });
    return null;
  }
  const taken = compoundTemplateStore.list.getState().map((t) => t.name);
  const name = cleanCompoundTemplateName(fields.name ?? "") ?? cleanCompoundTemplateName(project.sequences[sequenceId]?.name ?? "") ?? nextCompoundTemplateName(taken);
  const record = compoundTemplate(bundle, { id: newId(), name, category: cleanCategory(fields.category ?? ""), now: new Date().toISOString(), thumbnail: thumbnail(sequenceId) });
  try {
    const files = await gatherFiles(bundle.media, bundle.families);
    await compoundTemplateStore.add(record, files);
    const library = libraryFolderDir();
    if (library) await writeTemplateFolder(library, record, files).catch((error) => console.warn("[templates] cannot write the library folder", error));
    showToast({ tone: "success", message: `Saved template "${record.name}"`, detail: library ? "In the library folder too." : "" });
    return record;
  } catch (error) {
    console.error("[templates] save failed", error);
    showToast({ tone: "error", message: "Saving the template failed", detail: errorText(error) });
    return null;
  }
}

export async function removeCompoundTemplate(id: string): Promise<void> {
  await compoundTemplateStore.remove(id);
  const library = libraryFolderDir();
  if (library) await removeTemplateFolder(library, id).catch((error) => console.warn("[templates] cannot remove from the library folder", error));
}

export async function updateCompoundTemplate(id: string, patch: { name?: string; category?: string }): Promise<void> {
  const name = patch.name === undefined ? undefined : cleanCompoundTemplateName(patch.name);
  await compoundTemplateStore.update(id, { ...(name && { name }), ...(patch.category !== undefined && { category: cleanCategory(patch.category) }) });
}

/** Adds the folder's templates the store does not hold yet (the library folder travels between machines). */
export async function syncTemplatesFromLibrary(): Promise<void> {
  const library = libraryFolderDir();
  if (!library) return;
  try {
    const known = new Set(compoundTemplateStore.list.getState().map((t) => t.id));
    const { templates } = await readTemplateFolder(library, new Date().toISOString());
    for (const { record, files } of templates) if (!known.has(record.id)) await compoundTemplateStore.add(record, files);
  } catch (error) {
    console.warn("[templates] cannot read the library folder", error);
  }
}

/** Inserts template `id` into the open project and places an instance at the playhead (one undo step). */
export async function insertCompoundTemplate(id: string): Promise<void> {
  const record = compoundTemplateStore.list.getState().find((t) => t.id === id);
  if (!record) return;
  try {
    const files = await compoundTemplateStore.files(id);
    // Fonts first: families the app does not know come in as My fonts.
    if (files.fonts.length > 0) await addFontFiles(files.fonts.map((f) => new File([f.blob], f.name))).catch(() => undefined);
    const entries = Object.entries(files.media).filter(([mediaId]) => record.bundle.media[mediaId]);
    const place = (items: readonly MediaItem[]) => {
      const map: Record<MediaId, MediaItem> = {};
      for (const [mediaId, file] of entries) {
        const item = items.find((candidate) => candidate.name === file.name);
        if (item) map[mediaId] = item;
      }
      const placed = instantiateBundle(record.bundle, newId, map);
      documentStore.transaction(`Insert template ${record.name}`, () => {
        documentStore.dispatch(insertBundleCommand(documentStore.getRoot(), placed));
        placeCompoundAtPlayhead(placed.sequenceId);
      });
    };
    if (entries.length === 0) place([]);
    else await importMediaFiles(entries.map(([, file]) => new File([file.blob], file.name)), { place, label: `Insert template ${record.name}` });
  } catch (error) {
    console.error("[templates] insert failed", error);
    showToast({ tone: "error", message: "Inserting the template failed", detail: errorText(error) });
  }
}

function selectedClipIds(): string[] {
  const selection = sessionStore.selection.getState();
  return selection.kind === "clips" ? [...selection.clipIds] : [];
}

/** The selected compound clip's sequence, when it has parameters. */
function selectedTemplateSequence(): SequenceId | null {
  const project = documentStore.getState();
  for (const id of selectedClipIds()) {
    const clip = project.clips[id];
    if (clip?.kind === "compound" && (project.sequences[clip.sequenceId]?.params?.length ?? 0) > 0) return clip.sequenceId;
  }
  return null;
}

/** Registers the template actions (palette entries in the catalog). Returns a stop function. */
export function installCompoundTemplateActions(): () => void {
  const stops = [
    actions.register(
      "template.expose",
      () => {
        const project = documentStore.getState();
        const primary = selectedClipIds()[0];
        if (!primary) return;
        const field = EXPOSABLE_FIELDS.find((candidate) => exposeProblem(project, primary, candidate.path) === null);
        const command = field ? exposeParam(project, primary, field.path) : null;
        if (command) documentStore.dispatch(command);
        else showToast({ tone: "warning", message: "Nothing to expose", detail: exposeProblem(project, primary, "text.value") ?? "Select a clip inside a compound." });
      },
      { enabled: () => hostSequenceOf(documentStore.getState()) !== null && selectedClipIds().length > 0 },
    ),
    actions.register(
      "template.reset",
      () => {
        const command = resetInstanceValues(documentStore.getState(), selectedClipIds(), null);
        if (command) documentStore.dispatch(command);
      },
      { enabled: () => selectedTemplateSequence() !== null },
    ),
    actions.register("template.save", () => void saveSequenceAsTemplate(selectedTemplateSequence() as SequenceId), { enabled: () => selectedTemplateSequence() !== null }),
  ];
  return () => stops.forEach((stop) => stop());
}
