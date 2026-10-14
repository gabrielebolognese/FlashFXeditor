// An open project wired to the app: loads the document and the session into the stores, autosaves the
// document, saves session.json, keeps the recent entry current, and flushes everything on close.
import type { Store } from "../core/store/createStore.js";
import type { DocumentStore } from "../core/store/DocumentStore.js";
import type { LayoutStore } from "../core/store/layoutStore.js";
import { filterSelection, fromSnapshot, toSnapshot } from "../core/store/selection.js";
import { setSelection, type SessionStore } from "../core/store/sessionStore.js";
import type { AppSettingsStore } from "./appSettings.js";
import { Autosaver, type SaveStatus } from "./Autosaver.js";
import type { FsDir } from "./fs.js";
import { ensureFolderLayout } from "./layout.js";
import type { OpenedProject } from "./openProject.js";
import { ensureAccess } from "./permissions.js";
import type { RecentProjects } from "./recentProjects.js";
import { discardRecovery, type Recovery } from "./recovery.js";
import { SessionSaver } from "./SessionSaver.js";

export interface ProjectSessionDeps {
  documentStore: DocumentStore;
  session: SessionStore;
  layout: LayoutStore;
  recent: RecentProjects;
  settings: AppSettingsStore;
  saveStatus: Store<SaveStatus>;
  appVersion: string;
  /** Where `visibilitychange` is watched; omitted in tests. */
  doc?: Document;
  sessionIntervalMs?: number;
}

export class ProjectSession {
  readonly dir: FsDir;
  readonly projectId: string;
  readonly autosaver: Autosaver;
  private readonly sessionSaver: SessionSaver;
  private readonly deps: ProjectSessionDeps;
  private readonly stops: (() => void)[] = [];
  private writable: boolean;
  private closed = false;

  constructor(opened: OpenedProject, deps: ProjectSessionDeps) {
    const { documentStore, session, layout, recent, settings } = deps;
    this.deps = deps;
    this.dir = opened.dir;
    this.projectId = opened.project.id;
    this.writable = opened.access === "readwrite";
    const readOnly = !this.writable;

    // Document first (load clears the selection), then the session on top of it.
    documentStore.load(opened.project);
    session.state.set(structuredClone(opened.session.state));
    setSelection(session, fromSnapshot(filterSelection(opened.session.selection, (id) => Object.hasOwn(opened.project.clips, id))));
    if (opened.session.layout) layout.setRatios(opened.session.layout);

    this.autosaver = new Autosaver({
      dir: this.dir,
      getProject: documentStore.getState,
      appVersion: deps.appVersion,
      status: deps.saveStatus,
      delayMs: settings.getState().autosaveDelayMs,
      readOnly,
      onSaved: (_project, savedAt) => void recent.update(this.projectId, { modified: savedAt }),
    });
    this.sessionSaver = new SessionSaver({
      dir: this.dir,
      readOnly,
      collect: () => ({ state: session.state.getState(), selection: toSnapshot(session.selection.getState()), layout: layout.getState().ratios }),
      ...(deps.sessionIntervalMs !== undefined && { intervalMs: deps.sessionIntervalMs }),
    });

    const markSession = () => this.sessionSaver.markDirty();
    this.stops.push(
      documentStore.subscribe(() => this.autosaver.markDirty()),
      documentStore.subscribe(
        (state, prev) => {
          if (state.name !== prev.name) void recent.update(this.projectId, { name: state.name });
        },
        { affects: ["settings"] },
      ),
      session.state.subscribe(markSession),
      session.selection.subscribe(markSession),
      layout.select((s) => s.ratios, markSession),
      settings.select((s) => s.autosaveDelayMs, (ms) => this.autosaver.setDelay(ms)),
    );

    const doc = deps.doc;
    if (doc) {
      const onVisibility = () => {
        if (doc.visibilityState === "hidden") void this.flush();
      };
      doc.addEventListener("visibilitychange", onVisibility);
      this.stops.push(() => doc.removeEventListener("visibilitychange", onVisibility));
    }

    void recent.touch({ id: opened.project.id, name: opened.project.name, pathHint: this.dir.name, modified: opened.project.meta.modifiedAt, handle: this.dir.handle });
  }

  get readOnly(): boolean {
    return !this.writable;
  }

  /** Mod+S and the save dot: write now even without changes. */
  saveNow(): Promise<boolean> {
    return this.autosaver.saveNow();
  }

  /** Asks for write access again (call from a click). Returns true when the project became writable. */
  async requestWriteAccess(): Promise<boolean> {
    if (this.writable) return true;
    if ((await ensureAccess(this.dir, { request: true, retry: true })) !== "readwrite" || this.closed) return false;
    this.writable = true;
    try {
      await ensureFolderLayout(this.dir);
    } catch (error) {
      console.warn("[project] could not complete the folder layout", error);
    }
    this.sessionSaver.setReadOnly(false);
    this.autosaver.setReadOnly(false);
    return true;
  }

  /** Replaces the document with the recovered one; it is saved by the next autosave. */
  restoreRecovery(recovery: Recovery): void {
    this.deps.documentStore.load(recovery.project);
  }

  async discardRecovery(): Promise<void> {
    if (this.writable) await discardRecovery(this.dir);
  }

  async flush(): Promise<void> {
    await Promise.all([this.autosaver.flush(), this.sessionSaver.flush()]);
  }

  /** Saves what is pending and detaches from the stores. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const stop of this.stops) stop();
    await this.flush();
    this.autosaver.dispose();
    this.sessionSaver.dispose();
  }
}
