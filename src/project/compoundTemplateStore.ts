// Where compound templates live (spec §21.24, Batch 80): the global store (IndexedDB, next to the looks and the
// presets) and, when the user chose a library folder, one folder per template in its `templates/`:
//   templates/<id>/template.json   the record (`CompoundTemplate`)
//   templates/<id>/files.json      { media: { <mediaId>: <file name> }, fonts: [<file name>] }
//   templates/<id>/media/<name>    the media files, copied
//   templates/<id>/fonts/<name>    the font files the text needs
// The files of a template travel with it: inserting one in another project copies them in.
import { createStore, type Store } from "../core/store/createStore.js";
import { createProject } from "../core/document/project.js";
import type { MediaId, Project } from "../core/document/types.js";
import { sanitizeCompoundTemplate, MAX_COMPOUND_TEMPLATES, type CompoundTemplate } from "./compoundTemplates.js";
import type { FsDir } from "./fs.js";
import type { KeyValueStore } from "./kv.js";
import { safeFileName, uniqueName } from "./mediaFiles.js";

/** The files a template carries. */
export interface TemplateFiles {
  media: Record<MediaId, { name: string; blob: Blob }>;
  fonts: { name: string; blob: Blob }[];
}

export const emptyFiles = (): TemplateFiles => ({ media: {}, fonts: [] });

const KEY = "compoundTemplates.v1";
const filesKey = (id: string) => `compoundTemplateFiles.v1:${id}`;
export const TEMPLATES_DIR = "templates";
const RECORD_FILE = "template.json";
const FILES_FILE = "files.json";

/** A project the sanitizer can validate bundles against (only its media table and clips are replaced). */
const baseProject = (): Project => createProject({ id: "templates", name: "templates", now: "2026-01-01T00:00:00.000Z", appVersion: "1" });

/** The templates in IndexedDB, newest first. */
export class CompoundTemplateStore {
  readonly list: Store<readonly CompoundTemplate[]> = createStore<readonly CompoundTemplate[]>([]);
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly kv: KeyValueStore) {}

  async load(now = new Date().toISOString()): Promise<void> {
    try {
      const stored = await this.kv.get(KEY);
      const base = baseProject();
      const records = Array.isArray(stored) ? stored.map((value) => sanitizeCompoundTemplate(value, base, now)).filter((record): record is CompoundTemplate => record !== null) : [];
      this.list.set(records.slice(0, MAX_COMPOUND_TEMPLATES));
    } catch (error) {
      console.warn("[templates] cannot read the global templates", error);
    }
  }

  private persist(list: readonly CompoundTemplate[]): Promise<void> {
    this.list.set(list);
    const run = this.writing.then(() => this.kv.set(KEY, list));
    this.writing = run.catch(() => undefined);
    return run;
  }

  /** Adds (or replaces, by id) a template with its files; the newest comes first. Resolves when stored. */
  async add(record: CompoundTemplate, files: TemplateFiles): Promise<void> {
    await this.kv.set(filesKey(record.id), files);
    await this.persist([record, ...this.list.getState().filter((known) => known.id !== record.id)].slice(0, MAX_COMPOUND_TEMPLATES));
  }

  async remove(id: string): Promise<void> {
    if (!this.list.getState().some((record) => record.id === id)) return;
    await this.persist(this.list.getState().filter((record) => record.id !== id));
    await this.kv.del(filesKey(id));
  }

  /** Changes the name and category of a template (already cleaned by the caller). */
  async update(id: string, patch: Partial<Pick<CompoundTemplate, "name" | "category">>): Promise<void> {
    const list = this.list.getState();
    if (!list.some((record) => record.id === id)) return;
    await this.persist(list.map((record) => (record.id === id ? { ...record, ...patch } : record)));
  }

  /** The files of a template, or empty ones when none were stored. */
  async files(id: string): Promise<TemplateFiles> {
    try {
      const stored = (await this.kv.get(filesKey(id))) as TemplateFiles | undefined;
      return stored?.media && Array.isArray(stored.fonts) ? stored : emptyFiles();
    } catch {
      return emptyFiles();
    }
  }
}

// The library folder.

/** Writes the template into `<library>/templates/<id>/`. */
export async function writeTemplateFolder(library: FsDir, record: CompoundTemplate, files: TemplateFiles): Promise<void> {
  const templates = await library.dir(TEMPLATES_DIR, { create: true });
  const dir = await templates?.dir(record.id, { create: true });
  if (!dir) throw new Error("Cannot create the templates folder");
  const mediaDir = Object.keys(files.media).length > 0 ? await dir.dir("media", { create: true }) : null;
  const fontsDir = files.fonts.length > 0 ? await dir.dir("fonts", { create: true }) : null;
  const taken = new Set<string>();
  const media: Record<MediaId, string> = {};
  for (const [id, file] of Object.entries(files.media)) {
    const name = uniqueName(taken, safeFileName(file.name));
    taken.add(name);
    await mediaDir?.writeFile(name, file.blob);
    media[id] = name;
  }
  const fonts: string[] = [];
  const fontNames = new Set<string>();
  for (const file of files.fonts) {
    const name = uniqueName(fontNames, safeFileName(file.name));
    fontNames.add(name);
    await fontsDir?.writeFile(name, file.blob);
    fonts.push(name);
  }
  await dir.writeText(FILES_FILE, `${JSON.stringify({ media, fonts }, null, 2)}\n`);
  await dir.writeText(RECORD_FILE, `${JSON.stringify(record, null, 2)}\n`);
}

/** Removes `<library>/templates/<id>/` (its files first; a missing folder is fine). */
export async function removeTemplateFolder(library: FsDir, id: string): Promise<void> {
  const templates = await library.dir(TEMPLATES_DIR, { create: false });
  const dir = await templates?.dir(id, { create: false });
  if (!templates || !dir) return;
  for (const sub of ["media", "fonts"]) {
    const subDir = await dir.dir(sub, { create: false });
    if (subDir) for (const entry of await subDir.list()) if (entry.kind === "file") await subDir.remove(entry.name);
  }
  for (const name of [RECORD_FILE, FILES_FILE]) await dir.remove(name);
}

/** The templates the library folder holds, with their files; a folder that is not a sound template is skipped and counted. */
export async function readTemplateFolder(library: FsDir, now: string): Promise<{ templates: { record: CompoundTemplate; files: TemplateFiles }[]; skipped: number }> {
  const templates = await library.dir(TEMPLATES_DIR, { create: false });
  const out: { record: CompoundTemplate; files: TemplateFiles }[] = [];
  let skipped = 0;
  if (!templates) return { templates: out, skipped };
  const base = baseProject();
  for (const entry of await templates.list()) {
    if (entry.kind !== "directory") continue;
    try {
      const dir = await templates.dir(entry.name, { create: false });
      const text = await dir?.readFile(RECORD_FILE);
      if (!dir || !text) continue;
      const record = sanitizeCompoundTemplate(JSON.parse(text.text) as unknown, base, now);
      if (!record) {
        skipped += 1;
        continue;
      }
      const listed = JSON.parse((await dir.readFile(FILES_FILE))?.text ?? "{}") as { media?: Record<string, string>; fonts?: string[] };
      const files = emptyFiles();
      const mediaDir = await dir.dir("media", { create: false });
      for (const [id, name] of Object.entries(listed.media ?? {})) {
        const blob = typeof name === "string" ? await mediaDir?.getFile(name) : null;
        if (blob && record.bundle.media[id]) files.media[id] = { name, blob };
      }
      const fontsDir = await dir.dir("fonts", { create: false });
      for (const name of listed.fonts ?? []) {
        const blob = typeof name === "string" ? await fontsDir?.getFile(name) : null;
        if (blob) files.fonts.push({ name, blob });
      }
      out.push({ record, files });
    } catch (error) {
      console.warn(`[templates] cannot read ${entry.name}`, error);
      skipped += 1;
    }
  }
  return { templates: out, skipped };
}
