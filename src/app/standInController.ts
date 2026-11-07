// Baked stand-ins (spec §21.5, Batch 56): `clip.makeEditable` for the selected stand-in, `project.makeAllEditable`
// for every convertible one, each behind one confirmation (edits made to the stand-in itself are not carried
// over), one undo step, and the toast shown once per open when some can be converted. The conversion itself is
// `core/document/makeEditable.ts`; this file probes the media the data brings (in the analysis worker, like an
// import) and reports.
import { convertAll, convertStandIn, makeEditableCommand, standInMedia, standIns } from "../core/document/makeEditable.js";
import type { MediaFacts } from "../core/document/normalize.js";
import type { Clip, ClipId, Project } from "../core/document/types.js";
import { resolveFile } from "../project/mediaFiles.js";
import { showToast } from "../ui/toasts.js";
import { closeDialog, appView, currentSession, showDialog } from "./projectController.js";
import { actions, appVersion, documentStore, sessionStore, workerPool } from "./services.js";

const now = () => new Date().toISOString();

/** Header facts of the media records the stand-in's data brings without a duration (probed like an import; the others are used as written). */
async function factsOf(clip: Clip): Promise<Record<string, MediaFacts>> {
  const session = currentSession();
  const facts: Record<string, MediaFacts> = {};
  if (!session) return facts;
  for (const [id, record] of Object.entries(standInMedia(clip))) {
    const relPath = typeof record.file === "object" && record.file !== null ? (record.file as { relPath?: unknown }).relPath : undefined;
    if (typeof relPath !== "string") continue;
    try {
      const file = await resolveFile(session.dir, relPath);
      if (!file) {
        facts[id] = { error: "the file is missing" };
        continue;
      }
      facts[id] = { size: file.size };
      if (typeof record.durationUs !== "number") facts[id] = { size: file.size, probe: await workerPool.request("mediaHeader", { file, name: file.name }, { priority: "user" }) };
    } catch (error) {
      facts[id] = { error: error instanceof Error ? error.message : String(error) };
    }
  }
  return facts;
}

/** Why the selected stand-in cannot be made editable, or null when it can (checked on the records as written). */
export function standInBlocker(project: Project, clipId: ClipId): string | null {
  const result = convertStandIn(project, clipId, { now: now(), appVersion });
  return result.ok ? null : result.reason;
}

/** Opens the confirmation: for one stand-in, or (null) for all of them. */
export function requestMakeEditable(clipId: ClipId | null): void {
  const session = currentSession();
  if (!session) return;
  if (session.readOnly) {
    showToast({ tone: "warning", message: "This project is read-only", detail: "Allow editing to make baked layers editable." });
    return;
  }
  showDialog({ kind: "makeEditable", clipId });
}

/** The dialog's Make editable: converts, in one undo step, and reports. */
export async function confirmMakeEditable(clipId: ClipId | null): Promise<void> {
  closeDialog();
  const project = documentStore.getState();
  const stands = clipId === null ? standIns(project) : [project.clips[clipId]].filter((clip): clip is Clip => clip?.fallbackOf !== undefined);
  if (stands.length === 0) return;
  const factsByClip = new Map<ClipId, Record<string, MediaFacts>>();
  for (const stand of stands) factsByClip.set(stand.id, await factsOf(stand));
  // The document may have changed while the files were read: convert what is there now.
  const current = documentStore.getState();
  if (clipId !== null) {
    const result = convertStandIn(current, clipId, { now: now(), appVersion, facts: factsByClip.get(clipId) ?? {} });
    if (!result.ok) {
      showToast({ tone: "warning", message: "Can't make this layer editable", detail: result.reason });
      return;
    }
    documentStore.dispatch(makeEditableCommand("clip.makeEditable", "Make editable", result.changes));
    showToast({ tone: "success", message: "Made editable", detail: `${current.clips[clipId]?.name ?? "The layer"} is now a native ${current.clips[clipId]?.fallbackOf?.kind ?? ""} clip.` });
    return;
  }
  const all = convertAll(current, { now: now(), appVersion, factsFor: (clip) => factsByClip.get(clip.id) });
  if (all.converted.length > 0) documentStore.dispatch(makeEditableCommand("project.makeAllEditable", "Make all editable", all.changes));
  reportAll(all.converted.length, all.remaining.map((entry) => ({ name: current.clips[entry.clipId]?.name ?? entry.clipId, reason: entry.reason })));
}

function reportAll(converted: number, remaining: readonly { name: string; reason: string }[]): void {
  const plural = (n: number) => `${n} baked layer${n === 1 ? "" : "s"}`;
  if (remaining.length === 0) {
    showToast({ tone: "success", message: `Made ${plural(converted)} editable` });
    return;
  }
  const first = remaining[0];
  const detail = `${remaining.length} left: ${first ? `${first.name}: ${first.reason}` : ""}${remaining.length > 1 ? ` (and ${remaining.length - 1} more)` : ""}`;
  showToast({ tone: converted > 0 ? "info" : "warning", message: converted > 0 ? `Made ${plural(converted)} editable` : "No baked layer can be made editable", detail }, { durationMs: 9000 });
}

/** Once per open: how many baked layers could be converted now. */
function announce(): void {
  const project = documentStore.getState();
  if (standIns(project).length === 0) return;
  const { converted } = convertAll(project, { now: now(), appVersion });
  if (converted.length === 0) return;
  showToast(
    { tone: "info", message: `${converted.length} baked layer${converted.length === 1 ? "" : "s"} can be made editable`, action: { label: "Make all editable", run: () => actions.run("project.makeAllEditable") } },
    { durationMs: 9000 },
  );
}

export function installStandInController(): () => void {
  const selectedStandIn = (): ClipId | null => {
    const selection = sessionStore.selection.getState();
    if (selection.kind !== "clips" || selection.clipIds.size !== 1) return null;
    const [id] = [...selection.clipIds];
    return id !== undefined && documentStore.getState().clips[id]?.fallbackOf !== undefined ? id : null;
  };
  const stops = [
    actions.register("clip.makeEditable", (_context, id) => {
      const target = typeof id === "string" ? id : selectedStandIn();
      if (target !== null) requestMakeEditable(target);
    }, { enabled: () => currentSession() !== null && selectedStandIn() !== null }),
    actions.register("project.makeAllEditable", () => requestMakeEditable(null), { enabled: () => currentSession() !== null && standIns(documentStore.getState()).length > 0 }),
    appView.select(
      (view) => view.project?.id ?? null,
      (id) => {
        if (id !== null) announce();
      },
    ),
  ];
  return () => {
    for (const stop of stops) stop();
  };
}
