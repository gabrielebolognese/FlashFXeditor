// The text engine in the app (spec §10.1, §11 Text section):
// - Fonts: the bundled faces are installed at start; the layouts fall back to the DS body font (from
//   the theme). A font that loads, or project fonts that come and go, drop the cached layouts (and the
//   rasters of a family whose project faces changed) and redraw the preview, the canvas and the
//   timeline (missing font badges).
// - The Text section's edits: `editTexts` (one command over the selected text clips), and
//   `previewTexts` (a color dragged in the picker: ephemeral, P2). Both keep each box's anchored point
//   in place (timeline/edit/text.ts).
// - One-click text (spec §10.2, §18): `add.title` (T) and `add.subtitle` (Shift+T) add the default
//   Title or Subtitle at the playhead (placement in timeline/edit/text.ts `addTitle`), select it and
//   edit it inline at once with its content selected: one key, then type. `text.edit` (Enter) edits
//   the selected text clip (the playhead goes onto it when it is elsewhere); `text.commit` (Mod+Enter)
//   and `text.cancel` (Esc) commit and exit (§7.7: Esc keeps what was typed).
// - Dev builds: `dev.addText` adds a plain text clip at the playhead, and `__editor.text` exposes the
//   engine to the acceptance scripts.
import type { ClipId, Project, TextClip, Transform } from "../core/document/types.js";
import { secondsToFrames } from "../core/document/time.js";
import { createStore } from "../core/store/createStore.js";
import { selectClips, toSnapshot, type Selection } from "../core/store/selection.js";
import { setPlayhead } from "../core/store/sessionStore.js";
import type { LiveText } from "../render/compositor/Compositor.js";
import { invalidateTextLayouts, onTextLayoutsChanged, setTextFallback, textLayout } from "../render/text/layoutCache.js";
import { DEFAULT_TEXT_STYLE, type TitleKind } from "../text/style.js";
import { addTextClip, addTitle, setTexts, textEdit, type TextEdit } from "../timeline/edit/text.js";
import { isClipLocked } from "../timeline/model/queries.js";
import { patchLiveEdit } from "./liveEdit.js";
import { playbackEngine, textEditor, textRasters } from "./previewController.js";
import { actions, appSettings, documentStore, fontLibrary, scheduler, sessionStore, themeBridge } from "./services.js";

/** Changes when fonts load or project fonts change: React reads font sources again (missing badges). */
export const fontsVersion = createStore(0);

/** A text clip's edit: its new content and/or style (null: leave the clip). */
export type TextChange = (clip: TextClip) => Partial<TextEdit> | null;

/** The unlocked text clips among `ids`. */
function textClips(ids: readonly ClipId[]): TextClip[] {
  const project = documentStore.getState();
  const out: TextClip[] = [];
  for (const id of ids) {
    const clip = project.clips[id];
    if (clip?.kind === "text" && !isClipLocked(project, id)) out.push(clip);
  }
  return out;
}

/** `change` on the text clips among `ids` as one undo step (`coalesceKey`: consecutive steps merge). */
export function editTexts(ids: readonly ClipId[], change: TextChange, label: string, coalesceKey?: string): void {
  const edits = new Map<ClipId, Partial<TextEdit>>();
  for (const clip of textClips(ids)) {
    const edit = change(clip);
    if (edit) edits.set(clip.id, edit);
  }
  const command = setTexts(documentStore.getState(), edits, { label, ...(coalesceKey !== undefined && { coalesceKey }) });
  if (command) documentStore.dispatch(command);
}

/** `change` shown live on the text clips among `ids` (no document change, P2); null ends it. */
export function previewTexts(ids: readonly ClipId[], change: TextChange | null): void {
  if (!change) {
    patchLiveEdit({ texts: null, transforms: null });
    return;
  }
  const project = documentStore.getState();
  const texts = new Map<ClipId, LiveText>();
  const transforms = new Map<ClipId, Transform>();
  for (const clip of textClips(ids)) {
    const edit = change(clip);
    if (!edit) continue;
    const next = textEdit(project, clip, edit);
    texts.set(clip.id, { text: next.text, style: next.style });
    if (next.transform !== clip.transform) transforms.set(clip.id, next.transform);
  }
  patchLiveEdit({ texts: texts.size > 0 ? texts : null, transforms: transforms.size > 0 ? transforms : null });
}

/** Dev: a text clip at the playhead (or `at`), 3 s by default, selected. Returns its id. */
function addDevText(options: { value?: string; style?: Partial<TextClip["style"]>; box?: TextClip["text"]["box"]; at?: number; seconds?: number; transform?: Transform } = {}): ClipId {
  const project = documentStore.getState();
  const frame = options.at ?? sessionStore.state.getState().playhead;
  const duration = secondsToFrames(options.seconds ?? 3, project.settings.fps);
  const result = addTextClip(project, frame, duration, () => crypto.randomUUID(), {
    value: options.value ?? "Text",
    style: { ...structuredClone(DEFAULT_TEXT_STYLE), ...options.style },
    ...(options.box && { box: options.box }),
    ...(options.transform && { transform: options.transform }),
  });
  documentStore.dispatch(result.command, { selection: toSnapshot(selectClips([result.clipId])) });
  return result.clipId;
}

/** The selected text clip a new title stacks under, or a text clip Enter edits: the primary one, else the first. */
function selectedTextClip(project: Project, selection: Selection): ClipId | null {
  if (selection.kind !== "clips") return null;
  const ids = selection.primary !== null ? [selection.primary, ...selection.clipIds] : [...selection.clipIds];
  return ids.find((id) => project.clips[id]?.kind === "text") ?? null;
}

/**
 * `+ Title` / `+ Subtitle` (spec §10.2): the default Title or Subtitle at the playhead (40 px under
 * a selected text clip), selected, edited inline at once with its content selected (typing replaces it).
 */
export function addTitleClip(kind: TitleKind): ClipId {
  textEditor.end(true);
  // Typing while playing would move the playhead off the new clip.
  playbackEngine.pause();
  const project = documentStore.getState();
  const below = selectedTextClip(project, sessionStore.selection.getState());
  const options = { kind, playhead: sessionStore.state.getState().playhead, matchClip: appSettings.getState().matchClipUnderPlayhead, below };
  const result = addTitle(project, options, () => crypto.randomUUID());
  documentStore.dispatch(result.command, { selection: toSnapshot(selectClips([result.clipId])) });
  textEditor.begin(result.clipId, "all");
  return result.clipId;
}

/** Enter (spec §7.7, §18): edits the selected text clip inline, all of it selected; declined without one. */
function editSelectedText(): boolean {
  const project = documentStore.getState();
  const id = selectedTextClip(project, sessionStore.selection.getState());
  const clip = id ? project.clips[id] : undefined;
  if (!id || !clip || isClipLocked(project, id)) return false;
  playbackEngine.pause();
  // The canvas shows the clip at the playhead: bring the playhead onto it.
  const playhead = sessionStore.state.getState().playhead;
  if (playhead < clip.start || playhead >= clip.start + clip.duration) setPlayhead(sessionStore, clip.start);
  return textEditor.begin(id, "all");
}

/** Starts the text engine's app wiring. Returns a stop function. */
export function installTextController(): () => void {
  setTextFallback(themeBridge.theme.font.ui);
  const stops = [
    fontLibrary.install(),
    themeBridge.subscribe((theme) => setTextFallback(theme.font.ui)),
    fontLibrary.subscribe((change) => {
      // Project faces came or went: rasters of those families drew another font.
      if (change.redraw) for (const family of change.families) textRasters.dropFamily(family);
      invalidateTextLayouts();
      fontsVersion.set((version) => version + 1);
      scheduler.invalidate("timelineContent");
    }),
    // Layouts dropped (a font loaded, the fallback changed): the picture and the gizmo follow.
    onTextLayoutsChanged(() => {
      scheduler.invalidate("preview");
      scheduler.invalidate("gizmo");
    }),
    actions.register("add.title", () => void addTitleClip("title")),
    actions.register("add.subtitle", () => void addTitleClip("subtitle")),
    actions.register("text.edit", editSelectedText),
    // Esc and Mod+Enter both commit and exit (spec §7.7); declined (the key goes on) when not editing.
    actions.register("text.commit", () => textEditor.end(true)),
    actions.register("text.cancel", () => textEditor.end(true)),
  ];
  if (import.meta.env.DEV) {
    stops.push(actions.register("dev.addText", () => void addDevText()));
    // Console access for the acceptance checks, e.g. `__editor.text.add({ value: "Hi", style: { stroke: {...} } })`.
    const editor = ((globalThis as { __editor?: Record<string, unknown> }).__editor ??= {});
    editor.text = { add: addDevText, rasters: textRasters, fonts: fontLibrary, layout: textLayout, edit: editTexts };
  }
  return () => {
    for (const stop of stops) stop();
  };
}
