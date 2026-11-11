// The project inbox: every project folder found in the watched folders, with its card and its review status.
// Discovery walks each watched folder up to MAX_DEPTH levels deep and takes every directory that holds a
// project.json; it never asks for permission (a folder without it is listed as needing a reconnect) and reads
// little: card.json, review.json and the first bytes of project.json, each again only when the file changed.
// Framework-free; the start screen reads `state`.
import { createStore, type Store } from "../../core/store/createStore.js";
import type { FsDir } from "../fs.js";
import type { KeyValueStore } from "../kv.js";
import { PROJECT_FILE } from "../layout.js";
import { ensureAccess } from "../permissions.js";
import { CARD_FILE, HEAD_BYTES, parseCard, parseProjectHead, scanProjectHead, type Card, type ProjectHead } from "./card.js";
import { openedReview, parseReview, readReview, REVIEW_FILE, reviewStatus, writeReview, type Review, type ReviewStatus } from "./review.js";
import type { WatchedFolder, WatchedFolders } from "./watchedFolders.js";

/** How deep below a watched folder a project folder may sit (the watched folder itself is level 0). */
export const MAX_DEPTH = 3;
/**
 * Folders that never hold projects. Hidden folders (a leading dot) are skipped too. `exports` is not in the
 * list: a project's own exports/ is never looked at (a project folder is not searched), and a generator's
 * root may keep its projects in one (`<root>/exports/<name>/project`).
 */
export const SKIPPED_FOLDERS: ReadonlySet<string> = new Set(["cache", "history", "media", "fonts", "luts", "node_modules"]);
/** A generator's backup of a project the user edited, kept next to the rebuilt one: `project.edited-<date>`. */
export const EDITED_COPY = /^project\.edited-/i;
const STATE_KEY = "inbox-state.v1";

export interface FoundProject {
  /** Segments from the watched folder to the project folder (empty: the watched folder is the project). */
  path: string[];
  dir: FsDir;
  /** The names of the files in the project folder. */
  files: ReadonlySet<string>;
}

/** Every project folder in `root`, sorted by path. A folder that cannot be listed is skipped. */
export async function findProjects(root: FsDir, maxDepth: number = MAX_DEPTH): Promise<FoundProject[]> {
  const found: FoundProject[] = [];
  const visit = async (dir: FsDir, path: string[]): Promise<void> => {
    let entries;
    try {
      entries = await dir.list();
    } catch (error) {
      if (path.length === 0) throw error;
      return;
    }
    const files = new Set(entries.filter((entry) => entry.kind === "file").map((entry) => entry.name));
    if (files.has(PROJECT_FILE)) {
      // A project folder holds no other projects.
      found.push({ path, dir, files });
      return;
    }
    if (path.length >= maxDepth) return;
    await Promise.all(
      entries
        .filter((entry) => entry.kind === "directory" && !entry.name.startsWith(".") && !SKIPPED_FOLDERS.has(entry.name.toLowerCase()))
        .map(async (entry) => {
          const child = await dir.dir(entry.name).catch(() => null);
          if (child) await visit(child, [...path, entry.name]);
        }),
    );
  };
  await visit(root, []);
  return found.sort((a, b) => a.path.join("/").localeCompare(b.path.join("/")));
}

export interface InboxEntry {
  /** Folder id and path: one card. */
  key: string;
  folderId: string;
  folderLabel: string;
  /** The path inside the watched folder, segments joined by `/`. */
  path: string;
  dir: FsDir;
  /** project.json `id`; null when the file is not readable JSON. */
  projectId: string | null;
  title: string;
  card: Card | null;
  format: string | null;
  durationSec: number | null;
  /** The card's poster image; null without one (the start screen falls back to the Recent thumbnail). */
  poster: File | null;
  /** When it was generated (the card's `generatedAt`, else the time project.json was written), ms since epoch. */
  time: number;
  /** What changes when the generator writes it again: the card's generationId, else the time of project.json. */
  generation: string;
  status: ReviewStatus;
  failedChecks: number;
  /** A `project.edited-<date>` folder: shown as "Edited copy", never counted or announced as not reviewed. */
  edited: boolean;
}

export interface InboxFolderState {
  id: string;
  label: string;
  name: string;
  /** `reconnect`: the browser wants a click before it gives access again. */
  access: "readwrite" | "read" | "reconnect";
  /** `error`: the folder could not be listed (moved, deleted, a drive that is gone). */
  error: string | null;
}

export interface InboxState {
  /** The first scan has finished. */
  loaded: boolean;
  /** When the folders were last looked at (ms since epoch): the "now" of the relative times. */
  scannedAt: number;
  folders: readonly InboxFolderState[];
  /** Not reviewed first, then newest first. */
  entries: readonly InboxEntry[];
}

interface LocalState {
  /** Reviews kept here when the project folder cannot be written, by project id and generation; null: marked as not reviewed. */
  reviews: Record<string, Review | null>;
  /** Cards removed from the inbox: entry key -> the generation that was hidden. */
  hidden: Record<string, string>;
}

interface Cached {
  stamp: string;
  value: unknown;
}

const stampOf = (file: File) => `${file.lastModified}:${file.size}`;
/**
 * The key of a browser-side review record: the card (folder id and path; empty for a project outside the
 * watched folders), the project id and the generation. Two folders that hold the same project keep two records.
 */
const localKey = (entryKey: string, projectId: string | null, generationId: string | null) => `${entryKey}|${projectId ?? ""}|${generationId ?? ""}`;

/** Waiting for a look: not reviewed, and not an edited copy. */
export const isWaiting = (entry: InboxEntry): boolean => entry.status !== "reviewed" && !entry.edited;

function sorted(entries: InboxEntry[]): InboxEntry[] {
  const rank = (entry: InboxEntry) => (isWaiting(entry) ? 0 : 1);
  return entries.sort((a, b) => rank(a) - rank(b) || b.time - a.time || a.key.localeCompare(b.key));
}

export class Inbox {
  readonly state: Store<InboxState> = createStore<InboxState>({ loaded: false, scannedAt: 0, folders: [], entries: [] });
  private local: LocalState | null = null;
  private readonly cache = new Map<string, Cached>();
  /** The generation of every card of the last scan; null before the first one. */
  private known: Map<string, string> | null = null;
  private scanning: Promise<InboxEntry[]> | null = null;

  constructor(
    private readonly folders: WatchedFolders,
    private readonly kv: KeyValueStore,
    private readonly now: () => Date = () => new Date(),
    /** Whether two directories are the same folder on disk (`isSameEntry` in the app). */
    private readonly isSame: (a: FsDir, b: FsDir) => Promise<boolean> = async (a, b) => a.handle === b.handle,
  ) {}

  /**
   * Looks at every watched folder again. Resolves to the cards that appeared since the scan before (new, or
   * built again) and are not reviewed; the first scan reports none.
   */
  scan(): Promise<InboxEntry[]> {
    this.scanning ??= this.runScan().finally(() => {
      this.scanning = null;
    });
    return this.scanning;
  }

  private async runScan(): Promise<InboxEntry[]> {
    await this.folders.load();
    const local = await this.loadLocal();
    const folderStates: InboxFolderState[] = [];
    const entries: InboxEntry[] = [];
    const seen = new Set<string>();
    await Promise.all(
      this.folders.folders().map(async (folder, index) => {
        const access = await ensureAccess(folder.dir, { request: false });
        const state: InboxFolderState = { id: folder.id, label: folder.label, name: folder.name, access: access === "none" ? "reconnect" : access, error: null };
        folderStates[index] = state;
        if (access === "none") return;
        try {
          const found = await findProjects(folder.dir);
          const read = await Promise.all(found.map((project) => this.readEntry(folder, project, local, seen)));
          entries.push(...read.filter((entry): entry is InboxEntry => entry !== null));
        } catch (error) {
          state.error = error instanceof Error ? error.message : String(error);
        }
      }),
    );
    // Files that are gone leave the cache; a hidden card whose project is gone is forgotten.
    for (const key of [...this.cache.keys()]) if (!seen.has(key)) this.cache.delete(key);
    const visible = entries.filter((entry) => local.hidden[entry.key] !== entry.generation);
    const before = this.known;
    const readable = new Set(folderStates.filter((folder) => folder.access !== "reconnect" && folder.error === null).map((folder) => folder.id));
    const known = new Map<string, string>();
    // A folder that could not be read keeps what was known of it: its cards are not new when it comes back.
    if (before) for (const [key, generation] of before) if (!readable.has(key.slice(0, key.indexOf("/")))) known.set(key, generation);
    for (const entry of entries) known.set(entry.key, entry.generation);
    this.known = known;
    this.state.set({ loaded: true, scannedAt: this.now().getTime(), folders: folderStates, entries: sorted(visible) });
    if (!before) return [];
    return visible.filter((entry) => isWaiting(entry) && before.get(entry.key) !== entry.generation);
  }

  /** The text of a file, parsed by `parse` only when the file changed since the last scan. */
  private async cached<T>(dir: FsDir, name: string, key: string, seen: Set<string>, parse: (file: File) => Promise<T>): Promise<{ value: T; file: File } | null> {
    const file = await dir.getFile(name).catch(() => null);
    if (!file) return null;
    seen.add(key);
    const stamp = stampOf(file);
    const hit = this.cache.get(key);
    if (hit && hit.stamp === stamp) return { value: hit.value as T, file };
    const value = await parse(file);
    this.cache.set(key, { stamp, value });
    return { value, file };
  }

  private async readEntry(folder: WatchedFolder, project: FoundProject, local: LocalState, seen: Set<string>): Promise<InboxEntry | null> {
    const path = project.path.join("/");
    const key = `${folder.id}/${path}`;
    try {
      const head = await this.cached<ProjectHead>(project.dir, PROJECT_FILE, `${key}#head`, seen, async (file) => scanProjectHead(await file.slice(0, HEAD_BYTES).text()) ?? parseProjectHead(await file.text()));
      if (!head) return null;
      const card = project.files.has(CARD_FILE) ? ((await this.cached<Card | null>(project.dir, CARD_FILE, `${key}#card`, seen, async (file) => parseCard(await file.text())))?.value ?? null) : null;
      const onDisk = project.files.has(REVIEW_FILE) ? ((await this.cached<Review | null>(project.dir, REVIEW_FILE, `${key}#review`, seen, async (file) => parseReview(await file.text())))?.value ?? null) : null;
      // The poster keeps its File while the image is unchanged, so the start screen keeps its picture.
      const poster = card?.poster && /^[^/\\]+$/.test(card.poster) && project.files.has(card.poster) ? ((await this.cached<File>(project.dir, card.poster, `${key}#poster`, seen, async (file) => file))?.value ?? null) : null;
      const generationId = card?.generationId ?? null;
      const projectId = head.value.id;
      // A record of this browser (a read-only folder) wins over the file: the card's own, else one written when
      // the project was opened from outside the watched folders.
      const own = localKey(key, projectId, generationId);
      const loose = localKey("", projectId, generationId);
      const review = own in local.reviews ? (local.reviews[own] ?? null) : projectId !== null && loose in local.reviews ? (local.reviews[loose] ?? null) : onDisk;
      const generated = card?.generatedAt ? Date.parse(card.generatedAt) : Number.NaN;
      return {
        key,
        folderId: folder.id,
        folderLabel: folder.label,
        path,
        dir: project.dir,
        projectId,
        title: card?.title ?? head.value.name ?? project.dir.name,
        card,
        format: card?.format ?? head.value.format,
        durationSec: card?.durationSec ?? null,
        poster,
        time: Number.isNaN(generated) ? head.file.lastModified : generated,
        generation: generationId ?? `written:${head.file.lastModified}`,
        status: reviewStatus(generationId, review),
        failedChecks: card ? card.checks.filter((check) => !check.ok).length : 0,
        edited: EDITED_COPY.test(project.path.at(-1) ?? project.dir.name),
      };
    } catch (error) {
      console.warn(`[inbox] cannot read ${folder.name}/${path}`, error);
      return null;
    }
  }

  /** The Reconnect button: asks for access again (needs the click's user gesture), then scans. False when refused. */
  async reconnect(folderId: string): Promise<boolean> {
    const folder = this.folders.folders().find((other) => other.id === folderId);
    if (!folder) return false;
    const access = await ensureAccess(folder.dir, { request: true, retry: true });
    await this.scan();
    return access !== "none";
  }

  /**
   * A project was opened (from a card, Recent, a link, Open project or a drop): it is reviewed. Writes
   * review.json into its folder; when the folder cannot be written the same record is kept in this browser.
   */
  async markOpened(dir: FsDir, projectId: string): Promise<Review> {
    let generationId: string | null = null;
    let previous: Review | null = null;
    try {
      const card = await dir.readFile(CARD_FILE);
      generationId = card ? (parseCard(card.text)?.generationId ?? null) : null;
      previous = await readReview(dir);
    } catch (error) {
      console.warn("[inbox] cannot read the card or the review of the opened project", error);
    }
    const review = openedReview(previous, generationId, this.now().toISOString());
    // The card of this folder, when it is in the inbox: its record is its own.
    let entryKey = "";
    for (const entry of this.state.getState().entries) {
      if (entry.projectId === projectId && (await this.isSame(entry.dir, dir).catch(() => false))) {
        entryKey = entry.key;
        break;
      }
    }
    await this.storeReview(dir, localKey(entryKey, projectId, generationId), review);
    return review;
  }

  /** Mark as reviewed / Mark as not reviewed (the card's menu). */
  async setReviewed(entry: InboxEntry, reviewed: boolean): Promise<void> {
    const generationId = entry.card?.generationId ?? null;
    const key = localKey(entry.key, entry.projectId, generationId);
    if (reviewed) {
      const previous = await readReview(entry.dir).catch(() => null);
      await this.storeReview(entry.dir, key, openedReview(previous, generationId, this.now().toISOString()));
    } else {
      const local = await this.loadLocal();
      try {
        await entry.dir.remove(REVIEW_FILE);
        delete local.reviews[key];
      } catch {
        local.reviews[key] = null;
      }
      await this.saveLocal();
    }
    await this.scan();
  }

  /** Remove from inbox: hidden until the generator writes it again. Nothing on disk changes. */
  async hide(entry: InboxEntry): Promise<void> {
    const local = await this.loadLocal();
    local.hidden[entry.key] = entry.generation;
    await this.saveLocal();
    this.state.set((state) => ({ ...state, entries: state.entries.filter((other) => other.key !== entry.key) }));
  }

  private async storeReview(dir: FsDir, key: string, review: Review): Promise<void> {
    const local = await this.loadLocal();
    try {
      await writeReview(dir, review);
      if (key in local.reviews) {
        delete local.reviews[key];
        await this.saveLocal();
      }
    } catch (error) {
      // Read-only folder (no write permission, a locked drive): the record stays in this browser.
      console.info("[inbox] review.json not written, kept in the browser:", error instanceof Error ? error.message : error);
      local.reviews[key] = review;
      await this.saveLocal();
    }
  }

  private async loadLocal(): Promise<LocalState> {
    if (this.local) return this.local;
    let stored: Partial<LocalState> | null = null;
    try {
      stored = ((await this.kv.get(STATE_KEY)) as Partial<LocalState> | undefined) ?? null;
    } catch (error) {
      console.warn("[inbox] could not read the inbox state", error);
    }
    this.local ??= { reviews: { ...(stored?.reviews ?? {}) }, hidden: { ...(stored?.hidden ?? {}) } };
    return this.local;
  }

  private async saveLocal(): Promise<void> {
    try {
      await this.kv.set(STATE_KEY, { reviews: { ...this.local?.reviews }, hidden: { ...this.local?.hidden } });
    } catch (error) {
      console.warn("[inbox] could not store the inbox state", error);
    }
  }
}
