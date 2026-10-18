// Clipboard actions (spec §18, §6.16, §7.2, §11; Batch 39): Cut, Copy, Paste, Paste insert and Paste
// attributes of clips (and of keyframes while keys are selected), and Duplicate. The pure edits live
// in timeline/edit (clipboard.ts, duplicate.ts, pasteAttributes.ts); each action is one undo step.
// - The clipboard is this tab's last copy (`clipboard`, kept across project switches) mirrored on the
//   system clipboard as JSON text, so another tab or window can paste it into another project.
// - Mod+V and Mod+Shift+V decline their key (KeyDispatcher), so the browser's own paste event brings the
//   system clipboard's text with no permission prompt: a payload there is pasted (and, once pasted,
//   becomes this tab's clipboard), anything else pastes this tab's own copy. A menu row (no key)
//   pastes this tab's copy, or reads the system clipboard (the browser may ask once) when it has none.
// - A clipboard from elsewhere can hold anything: every paste (Paste attributes too) checks the
//   document it would make (`validateProject`) and leaves it untouched, with a toast, when it breaks.
// - Mod+D in the timeline (and the quick row) duplicates the selection after it; in the preview (and
//   the canvas menu) it duplicates the selected layers at +20 px (duplicate.ts), or the selection as
//   in the timeline when no layer is selected.
// - Paste attributes opens a checklist popover (`pasteAttributesMenu`) at the menu row or over the
//   focused panel; the groups left unchecked are remembered for the session.
// - Pasting moves the playhead to the end of the pasted clips (Premiere's paste), so repeated pastes
//   lay copies back to back; the pasted clips are selected.
import { produce } from "immer";
import type { Command } from "../core/commands/command.js";
import { hasTransitions, reconcileTransitions } from "../core/document/transitions.js";
import type { ClipId, MediaItem } from "../core/document/types.js";
import { validateProject } from "../core/document/validate.js";
import type { FocusScope } from "../core/keyboard/focusScope.js";
import { isEditableTarget, type ActionContext } from "../core/keyboard/KeyDispatcher.js";
import { createStore } from "../core/store/createStore.js";
import { EMPTY_SELECTION, selectClips, toSnapshot } from "../core/store/selection.js";
import { setPlayhead } from "../core/store/sessionStore.js";
import { errorMessage } from "../project/errorMessage.js";
import { copyClips, copySet, keysPayload, parseClipboard, pasteClips, payloadAtFrameRate, serializeClipboard, type ClipboardPayload, type ClipsPayload, type PasteResult } from "../timeline/edit/clipboard.js";
import { deleteClips } from "../timeline/edit/delete.js";
import { duplicateClips, duplicateLayers } from "../timeline/edit/duplicate.js";
import type { MoveMode } from "../timeline/edit/move.js";
import { attributeTargets, availableGroups, pasteAttributes, pastedSpeed, type AttributeGroup } from "../timeline/edit/pasteAttributes.js";
import { setSpeeds } from "../timeline/edit/speed.js";
import type { TrimLimit } from "../timeline/edit/trim.js";
import { showToast } from "../ui/toasts.js";
import { timelineMenu } from "./cutController.js";
import { copySelectedKeys, deleteSelectedKeys, keyframeClipboard, pasteKeyframes } from "./keyframeController.js";
import { canvasMenu } from "./previewController.js";
import { actions, documentStore, focusScopes, sessionStore } from "./services.js";
import { reportSpeedLimit, speedOptions } from "./speedController.js";

const newId = () => crypto.randomUUID();
const linked = () => sessionStore.state.getState().linkedSelection;

/** This tab's last copy (clips or keys), or null. */
export const clipboard = createStore<ClipboardPayload | null>(null);

/** The open Paste attributes popover: where, what it pastes onto which clips, and the groups it offers. */
export interface PasteAttributesMenu {
  x: number;
  y: number;
  /** The copied clips at the project's frame rate (spec §15 conversion, Batch 42). */
  payload: ClipsPayload;
  /** As copied: what the tab keeps when the payload came from the system clipboard. */
  copied: ClipsPayload;
  ids: ClipId[];
  groups: AttributeGroup[];
  /** The panel the keyboard goes back to when it closes. */
  scope: FocusScope;
  /** The payload was read from the system clipboard: it becomes this tab's clipboard once pasted. */
  fromSystem: boolean;
}

export const pasteAttributesMenu = createStore<PasteAttributesMenu | null>(null);

/** The groups the popover leaves unchecked (unchecked by the user earlier this session). */
export const uncheckedGroups = createStore<ReadonlySet<AttributeGroup>>(new Set());

/** The selected clip ids (none for a track or cue selection) and the primary. */
function selectedClips(): { ids: ClipId[]; primary: ClipId | null } {
  const selection = sessionStore.selection.getState();
  return selection.kind === "clips" ? { ids: [...selection.clipIds], primary: selection.primary } : { ids: [], primary: null };
}

// --- The system clipboard ----------------------------------------------------------------------

/** Mirrors `payload` on the system clipboard (best effort: a page without focus cannot write it). */
function mirror(payload: ClipboardPayload): void {
  void navigator.clipboard?.writeText(serializeClipboard(payload)).catch(() => undefined);
}

/** The payload on the system clipboard, or null (other text, no access). The browser may ask for permission once. */
async function readSystem(): Promise<ClipboardPayload | null> {
  try {
    const text = await navigator.clipboard?.readText();
    return text ? parseClipboard(text) : null;
  } catch {
    return null;
  }
}

/** Makes `payload` the clipboard and mirrors it. */
function keep(payload: ClipboardPayload): void {
  clipboard.set(payload);
  mirror(payload);
}

// --- Copy and cut --------------------------------------------------------------------------------

/** Copy (`cut`: Cut) of the selected keys, else of the selected clips; false when nothing is selected. */
function copy(cut: boolean): boolean {
  if (sessionStore.keyframes.getState()) {
    // The copied keys become the clipboard through `keyframeClipboard` (see the install).
    if (!copySelectedKeys()) return false;
    if (cut) deleteSelectedKeys();
    return true;
  }
  const { ids, primary } = selectedClips();
  const project = documentStore.getState();
  const payload = copyClips(project, ids, primary, { linked: linked() });
  if (!payload) return false;
  keep(payload);
  if (!cut) return true;
  const command = deleteClips(project, ids, { linked: linked() });
  if (command) documentStore.dispatch({ ...command, id: "clipboard.cut", label: "Cut" }, { selection: toSnapshot(EMPTY_SELECTION) });
  return true;
}

// --- Paste ---------------------------------------------------------------------------------------

/** Why a paste was refused, as a toast. */
function reportRefusal(result: Extract<PasteResult, { kind: "refused" }>): void {
  const project = documentStore.getState();
  const track = project.tracks.find((candidate) => candidate.id === result.trackId)?.name ?? "A track";
  switch (result.reason) {
    case "locked":
      showToast({ tone: "warning", message: "Can't paste onto a locked track", detail: `${track} is locked. Unlock it or target other tracks.` });
      return;
    case "noRoom":
      showToast({ tone: "info", message: "No room for the captions", detail: "The pasted cues would overlap captions near the playhead." });
      return;
  }
}

/** What is wrong with the document `command` would make, as the store would commit it (a clipboard from elsewhere is checked before it lands). */
function issuesAfter(command: Command): string[] {
  const project = documentStore.getState();
  const context = { playhead: sessionStore.state.getState().playhead, selection: toSnapshot(EMPTY_SELECTION), newId };
  try {
    return validateProject(
      produce(project, (draft) => {
        command.run(draft, context);
        if (hasTransitions(project)) reconcileTransitions(project, draft, newId);
      }),
    );
  } catch (error) {
    return [errorMessage(error)];
  }
}

/** A paste turned down because the clipboard would break the document (`what`: "clips", "keyframes", "attributes"). */
function reportBroken(what: string, issues: readonly string[]): void {
  console.warn("[clipboard] paste refused:", issues);
  showToast({ tone: "error", message: `Can't paste these ${what}`, detail: `The clipboard holds ${what} this project can't take.` });
}

function reportOffline(offline: readonly MediaItem[]): void {
  if (offline.length === 0) return;
  const names = offline.map((item) => item.name);
  const list = names.length <= 2 ? names.join(" and ") : `${names.slice(0, 2).join(", ")} and ${names.length - 2} more`;
  showToast({ tone: "warning", message: offline.length === 1 ? "Pasted with offline media" : `Pasted with ${offline.length} offline media`, detail: `${list} ${offline.length === 1 ? "is" : "are"} not in this project; the clips stay offline until the media is relinked.` });
}

/** Whether `command` makes a valid document; a toast and false when not (`what`: "clips" or "keyframes"). */
function acceptPaste(command: Command, what: string): boolean {
  const issues = issuesAfter(command);
  if (issues.length === 0) return true;
  reportBroken(what, issues);
  return false;
}

/**
 * Pastes `payload` at the playhead (`insert`: Paste insert): clips, or keys on the selected clips.
 * `adopt`: the payload comes from the system clipboard and becomes this tab's clipboard once it is
 * pasted (one this project can't take is never kept, so Paste attributes does not meet it either).
 */
function paste(payload: ClipboardPayload, mode: MoveMode, adopt: boolean): void {
  const accept = (command: Command, what: string): boolean => {
    if (!acceptPaste(command, what)) return false;
    if (adopt) clipboard.set(payload);
    return true;
  };
  if (payload.kind === "keys") {
    if (!pasteKeyframes(payload.keys, (command) => accept(command, "keyframes"))) showToast({ tone: "info", message: "Select a clip to paste keyframes on", detail: "Keyframes paste from the playhead on onto the selected clips." });
    return;
  }
  const playhead = sessionStore.state.getState().playhead;
  let result: PasteResult;
  try {
    result = pasteClips(documentStore.getState(), payload, { at: playhead, mode, newId });
  } catch (error) {
    // A payload from elsewhere can pass the shape check and still break the edit.
    reportBroken("clips", [errorMessage(error)]);
    return;
  }
  if (result.kind === "refused") {
    reportRefusal(result);
    return;
  }
  if (!accept(result.command, "clips")) return;
  documentStore.dispatch(result.command, { selection: toSnapshot(selectClips(result.placed, result.primary)) });
  setPlayhead(sessionStore, result.end);
  reportOffline(result.offline);
}

/** A key paste waiting for the browser's paste event (the system clipboard's text). */
let pending: { mode: MoveMode; timer: ReturnType<typeof setTimeout> } | null = null;

/** Ends a key paste: the system clipboard's payload when it held one, else this tab's copy. */
function finishKeyPaste(fromSystem: ClipboardPayload | null): void {
  if (!pending) return;
  clearTimeout(pending.timer);
  const { mode } = pending;
  pending = null;
  const payload = fromSystem ?? clipboard.getState();
  if (payload) paste(payload, mode, fromSystem !== null);
}

/** The browser's paste event after a declined Mod+V. */
function onPasteEvent(event: ClipboardEvent): void {
  if (!pending || isEditableTarget(event.target)) return;
  event.preventDefault();
  const text = event.clipboardData?.getData("text/plain") ?? "";
  finishKeyPaste(text ? parseClipboard(text) : null);
}

/** Paste and Paste insert: a key waits for the paste event (declined: the browser's paste runs); a click pastes at once. */
function pasteAction(mode: MoveMode) {
  return (context: ActionContext | null): boolean => {
    if (context) {
      if (context.repeat || pending) return true;
      // No paste event (it never came): this tab's copy, a moment later.
      pending = { mode, timer: setTimeout(() => finishKeyPaste(null), 100) };
      return false;
    }
    const payload = clipboard.getState();
    if (payload) paste(payload, mode, false);
    else void readSystem().then((found) => found && paste(found, mode, true));
    return true;
  };
}

// --- Paste attributes ----------------------------------------------------------------------------

/** Where the popover opens (at the context menu row that asked, else over the focused panel) and the scope it returns to. */
function popoverPlace(): { x: number; y: number; scope: FocusScope } {
  const menu = timelineMenu.getState();
  if (menu) return { x: menu.x, y: menu.y, scope: "timeline" };
  const canvas = canvasMenu.getState();
  if (canvas) return { x: canvas.x, y: canvas.y, scope: "preview" };
  const scope = focusScopes.scope === "preview" ? "preview" : "timeline";
  const rect = document.querySelector(`[data-panel="${scope}"]`)?.getBoundingClientRect();
  return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 3, scope } : { x: window.innerWidth / 2, y: window.innerHeight / 3, scope };
}

/** Opens the popover for the copied clips and the selection (a toast when there is nothing to paste or onto). */
function openPasteAttributes(copied: ClipboardPayload | null, fromSystem: boolean): void {
  const { ids } = selectedClips();
  if (!copied || copied.kind !== "clips") {
    showToast({ tone: "info", message: "Copy a clip first", detail: "Paste attributes gives the selected clips the look of the copied one." });
    return;
  }
  // Fades, keyframes and animations copied at another frame rate take this project's frames.
  const payload = payloadAtFrameRate(copied, documentStore.getState().settings.fps);
  const groups = availableGroups(documentStore.getState(), payload, ids);
  if (groups.length === 0) {
    showToast({ tone: "info", message: "Nothing to paste onto", detail: ids.length === 0 ? "Select the clips that should take the copied clip's look." : "The selected clips take none of the copied clip's attributes." });
    return;
  }
  pasteAttributesMenu.set({ ...popoverPlace(), payload, copied, ids, groups, fromSystem });
}

function pasteAttributesAction(): void {
  const payload = clipboard.getState();
  if (payload) openPasteAttributes(payload, false);
  else void readSystem().then((found) => openPasteAttributes(found, true));
}

/** Turns down a Paste attributes whose document breaks (thrown inside its transaction: nothing is committed). */
class BrokenPaste extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join("; "));
  }
}

/** Paste attributes' edits, inside its transaction; the speed limit they hit, or null. Throws `BrokenPaste` when the document they make breaks. */
function pasteAttributeEdits(menu: PasteAttributesMenu, groups: ReadonlySet<AttributeGroup>): TrimLimit | null {
  let limit: TrimLimit | null = null;
  let issues: string[];
  try {
    const command = pasteAttributes(documentStore.getState(), menu.payload, menu.ids, groups);
    if (command) documentStore.dispatch(command);
    const speed = pastedSpeed(menu.payload, groups);
    if (speed !== null) {
      const project = documentStore.getState();
      const { link, ripple } = speedOptions.getState();
      const result = setSpeeds(project, attributeTargets(project, menu.ids, "speed"), speed, { link, ripple, linked: linked() });
      if (result.command) documentStore.dispatch(result.command);
      limit = result.limit;
    }
    issues = validateProject(documentStore.getState());
  } catch (error) {
    // A copied clip from elsewhere can have the right shape at the top and still break an edit.
    issues = [errorMessage(error)];
  }
  if (issues.length > 0) throw new BrokenPaste(issues);
  return limit;
}

/**
 * The popover's Paste: the checked `groups` onto its clips, one undo step "Paste attributes". The
 * document it makes is validated before the transaction commits (a copied clip from elsewhere can
 * carry fractional fades or keys, a broken style); when it breaks, nothing changes and a toast says so.
 */
export function applyPasteAttributes(groups: ReadonlySet<AttributeGroup>): void {
  const menu = pasteAttributesMenu.getState();
  closePasteAttributes();
  if (!menu) return;
  // The offered groups' states are remembered; the others keep theirs.
  uncheckedGroups.set((before) => {
    const next = new Set(before);
    for (const group of menu.groups) {
      if (groups.has(group)) next.delete(group);
      else next.add(group);
    }
    return next;
  });
  let limit: TrimLimit | null;
  try {
    limit = documentStore.transaction("Paste attributes", () => pasteAttributeEdits(menu, groups));
  } catch (error) {
    if (!(error instanceof BrokenPaste)) throw error;
    // The transaction has left the document as it was.
    reportBroken("attributes", error.issues);
    return;
  }
  if (menu.fromSystem) clipboard.set(menu.copied);
  if (limit) reportSpeedLimit(limit);
}

/** Closes the popover; the keyboard goes back to the panel it was opened from. */
export function closePasteAttributes(): void {
  const menu = pasteAttributesMenu.getState();
  if (!menu) return;
  pasteAttributesMenu.set(null);
  focusScopes.set(menu.scope);
}

// --- Duplicate -----------------------------------------------------------------------------------

/** Mod+D in the timeline, the quick row: the selection (partners and groups included) after itself. */
function duplicateOnTimeline(): void {
  const { ids, primary } = selectedClips();
  const project = documentStore.getState();
  const result = duplicateClips(project, copySet(project, ids, linked()), newId);
  if (!result) return;
  const copies = [...result.placed.values()];
  documentStore.dispatch(result.command, { selection: toSnapshot(selectClips(copies, primary !== null ? result.placed.get(primary) : null)) });
}

/** Mod+D in the preview, the canvas menu: the selected layers at +20 px, each on the track above its own (no layer selected: the timeline's duplicate). */
function duplicateOnCanvas(): void {
  const { ids, primary } = selectedClips();
  const result = duplicateLayers(documentStore.getState(), ids, newId);
  if (!result) {
    duplicateOnTimeline();
    return;
  }
  const copies = [...result.placed.values()];
  documentStore.dispatch(result.command, { selection: toSnapshot(selectClips(copies, primary !== null ? result.placed.get(primary) : null)) });
}

// --- Install -------------------------------------------------------------------------------------

/** The clipboard holds something to paste (the menus' Paste rows). */
export function canPaste(): boolean {
  return clipboard.getState() !== null;
}

/** Registers the clipboard and duplicate actions. Returns a stop function. */
export function installClipboardController(): () => void {
  const stops = [
    actions.register("clipboard.copy", () => void copy(false)),
    actions.register("clipboard.cut", () => void copy(true)),
    // The palette dims them while the tab has no copy (the keys still read the system clipboard).
    actions.register("clipboard.paste", pasteAction("overwrite"), { enabled: canPaste }),
    actions.register("clipboard.pasteInsert", pasteAction("insert"), { enabled: canPaste }),
    actions.register("clipboard.pasteAttributes", pasteAttributesAction, { enabled: canPaste }),
    actions.register("edit.duplicate", (context) => (context?.scope === "preview" ? duplicateOnCanvas() : duplicateOnTimeline())),
    actions.register("canvas.duplicate", duplicateOnCanvas),
    // Keys copied from the keyframe menu become the clipboard too.
    keyframeClipboard.subscribe((keys) => {
      const current = clipboard.getState();
      if (keys && !(current?.kind === "keys" && current.keys === keys)) keep(keysPayload(keys));
    }),
    // The popover closes with the selection it pastes onto.
    sessionStore.selection.subscribe(() => closePasteAttributes()),
  ];
  document.addEventListener("paste", onPasteEvent, true);
  return () => {
    for (const stop of stops) stop();
    document.removeEventListener("paste", onPasteEvent, true);
    if (pending) clearTimeout(pending.timer);
    pending = null;
    pasteAttributesMenu.set(null);
  };
}
