import { Captions, Eraser, FileDown, FileUp, Mic, Paintbrush, Plus, SearchX } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type UIEvent } from "react";
import { commitCue, cueFocus, draftCue, mergeCueIntoPrevious, selectCue, splitCueAtCaret, type CueFocus } from "../../app/captionController.js";
import { actions, documentStore, sessionStore } from "../../app/services.js";
import { transcription, type TranscriptionState } from "../../app/transcription.js";
import { formatTimecode, type TimecodeMode } from "../../core/document/time.js";
import type { CaptionClip, ClipId, Project } from "../../core/document/types.js";
import type { Selection } from "../../core/store/selection.js";
import type { SessionState } from "../../core/store/sessionStore.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { cueMatches, wordCount } from "../../text/captions.js";
import { captionTrackOf } from "../../timeline/edit/captions.js";
import { clipAtFrame } from "../../timeline/model/queries.js";
import { Button } from "../../ui/Button.js";
import { ContextMenu, type ContextMenuEntry } from "../../ui/ContextMenu.js";
import { EmptyState } from "../../ui/EmptyState.js";
import { IconButton } from "../../ui/IconButton.js";
import { TextField } from "../../ui/TextField.js";
import styles from "./CaptionsTab.module.css";

// The Captions tab (spec §10.5, §12, §17 Captions header): the caption track's cue list. Each row shows
// the cue's in and out timecodes, its text (edited in place, shown live on the canvas) and its word
// count; a click selects the cue and puts the playhead on its start. While a text is edited: Enter
// splits the cue at the caret (Shift+Enter: a line break), Mod+Backspace at its start merges it into
// the previous cue, Tab / Shift+Tab go to the next / previous cue, Esc puts the text back. Delete
// deletes the selected cues (cutController). The list is virtualized: only the rows in view (and a
// block around them, and the row being edited) exist, re-rendered when the view crosses a block of
// rows, not on every scroll step; the cue under the playhead is marked through the DOM (no React
// render while playing, P1). A row that goes away while its text is edited commits the text.

/** Rows rendered beyond the view, and the scroll step that re-renders the list. */
const BLOCK = 16;
const EMPTY: readonly ClipId[] = [];

const selectHasTrack = (project: Project) => captionTrackOf(project) !== null;
const selectCueCount = (project: Project) => captionTrackOf(project)?.clipIds.length ?? 0;
const selectMode = (state: SessionState) => state.timecodeFormat;
/** True when an audio clip is on the timeline (Transcribe has something to hear). */
const selectHasAudio = (project: Project) => Object.values(project.clips).some((clip) => clip.kind === "audio");
const selectRunning = (state: TranscriptionState) => state.kind === "running";
/** The selected cue ids, as a key string (the list renders when it changes). */
const selectSelected = (selection: Selection) => (selection.kind === "clips" ? [...selection.clipIds].join("\n") : "");

/** Header actions of the Captions tab (spec §17): + Cue, Import, Export, Style, Transcribe, Clear. */
export function CaptionsActions() {
  const hasTrack = useStoreSelector(documentStore, selectHasTrack);
  const count = useStoreSelector(documentStore, selectCueCount);
  const hasAudio = useStoreSelector(documentStore, selectHasAudio);
  const running = useStoreSelector(transcription, selectRunning);
  return (
    <>
      <IconButton icon={Plus} label="Add a 2 s cue at the playhead" commandId="captions.addCue" onClick={() => actions.run("captions.addCue")} />
      <IconButton icon={FileUp} label="Import SRT or VTT (replaces the cues)" commandId="captions.import" onClick={() => actions.run("captions.import")} />
      <IconButton icon={FileDown} label={count > 0 ? "Export SRT or VTT" : "Export SRT or VTT: no cues yet"} commandId="captions.export" disabled={count === 0} onClick={() => actions.run("captions.export")} />
      <IconButton
        icon={Paintbrush}
        label={hasTrack ? "Caption style (in Edit Properties)" : "Caption style: no caption track yet (add a cue first)"}
        commandId="captions.style"
        disabled={!hasTrack}
        onClick={() => actions.run("captions.style")}
      />
      <IconButton
        icon={Mic}
        label={running ? "Cancel the transcription" : hasAudio ? "Transcribe the timeline's audio into cues (on this computer)" : "Transcribe: no audio on the timeline"}
        commandId="captions.transcribe"
        pressed={running}
        disabled={!hasAudio && !running}
        onClick={() => actions.run("captions.transcribe")}
      />
      <IconButton icon={Eraser} label={count > 0 ? "Clear all cues" : "Clear all cues: there are none"} commandId="captions.clear" disabled={count === 0} onClick={() => actions.run("captions.clear")} />
    </>
  );
}

/**
 * No caption track, or a track without cues (Batch 46: one look): Transcribe (disabled without audio
 * on the timeline), a cue at the playhead, an SRT or VTT file.
 */
function NoCues({ hasTrack, hasAudio }: { hasTrack: boolean; hasAudio: boolean }) {
  return (
    <EmptyState icon={Captions} title={hasTrack ? "No cues yet" : "No captions yet"} text="Transcribe the timeline's audio, add a cue at the playhead, or import an SRT or VTT file.">
      <Button variant="primary" icon={Mic} commandId="captions.transcribe" disabled={!hasAudio} tooltip={hasAudio ? undefined : "Transcribe: no audio on the timeline"} onClick={() => actions.run("captions.transcribe")}>
        Transcribe
      </Button>
      <Button icon={Plus} commandId="captions.addCue" onClick={() => actions.run("captions.addCue")}>
        Cue at playhead
      </Button>
      <Button icon={FileUp} commandId="captions.import" onClick={() => actions.run("captions.import")}>
        Import SRT/VTT
      </Button>
    </EmptyState>
  );
}

/** The rows run as the Captions tab's keys would (Delete deletes the selected cues there). */
const MEDIA_CONTEXT = { scope: "media", phase: "down", repeat: false } as const;

/** A cue row's menu (Batch 40): the selected cue's edit, clipboard, split / merge and delete, then the track's. */
function cueMenuEntries(project: Project, cueId: ClipId): ContextMenuEntry[] {
  const track = captionTrackOf(project);
  const index = track ? track.clipIds.indexOf(cueId) : -1;
  return [
    { kind: "item", id: "caption.editText", label: "Edit text" },
    { kind: "separator" },
    { kind: "item", id: "clipboard.cut", label: "Cut" },
    { kind: "item", id: "clipboard.copy", label: "Copy" },
    { kind: "item", id: "clipboard.paste", label: "Paste at playhead", disabled: !actions.isEnabled("clipboard.paste") },
    { kind: "separator" },
    { kind: "item", id: "edit.split", label: "Split at playhead" },
    { kind: "item", id: "caption.mergePrevious", label: "Merge with previous cue", disabled: index <= 0 },
    { kind: "item", id: "edit.delete", label: "Delete" },
    { kind: "separator" },
    { kind: "item", id: "captions.addCue", label: "Add cue at playhead" },
    { kind: "item", id: "captions.style", label: "Caption style" },
  ];
}

interface RowProps {
  id: ClipId;
  index: number;
  top: number;
  selected: boolean;
  mode: TimecodeMode;
  /** The shown cue ids, for Tab. */
  order: readonly ClipId[];
}

/** One cue: its times, its text (edited in place) and its word count. */
const CueRow = memo(function CueRow({ id, index, top, selected, mode, order }: RowProps) {
  const cue = useStoreSelector(documentStore, useCallback((project: Project) => project.clips[id] as CaptionClip | undefined, [id]));
  const fps = useStoreSelector(documentStore, selectFps);
  const focus = useStoreSelector(cueFocus, useCallback((request: CueFocus | null) => (request?.cueId === id ? request : null), [id]));
  const field = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  // Set once an edit was handled (split, merge, Tab, Esc): the blur that follows commits nothing.
  const handled = useRef(false);
  // The typed text not committed yet (null: none). When the field goes away while it is edited (the
  // row unmounted by the Media panel's tab switch, or its cue removed), no blur reaches it: the text is
  // committed here, so the canvas never keeps a draft the document lacks.
  const pending = useRef<string | null>(null);
  const present = cue !== undefined;
  useEffect(
    () => () => {
      const text = pending.current;
      pending.current = null;
      if (text !== null) commitCue(id, text);
    },
    [id, present],
  );

  useEffect(() => {
    const element = field.current;
    if (!focus || !element) return;
    cueFocus.set(null);
    element.focus();
    if (focus.caret === "all") element.select();
    else element.setSelectionRange(focus.caret, focus.caret);
  }, [focus]);

  if (!cue) return null;
  const text = draft ?? cue.text;
  const end = () => {
    handled.current = true;
    pending.current = null;
    setDraft(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return;
    const element = event.currentTarget;
    const value = element.value;
    if (event.key === "Enter" && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      if (splitCueAtCaret(id, value, element.selectionStart)) end();
    } else if (event.key === "Backspace" && (event.ctrlKey || event.metaKey) && element.selectionStart === 0 && element.selectionEnd === 0) {
      event.preventDefault();
      if (mergeCueIntoPrevious(id, value)) end();
    } else if (event.key === "Tab") {
      const next = order[order.indexOf(id) + (event.shiftKey ? -1 : 1)];
      if (!next) return;
      event.preventDefault();
      commitCue(id, value);
      end();
      cueFocus.set({ cueId: next, caret: "all" });
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      commitCue(id, null);
      end();
      element.closest<HTMLElement>("[data-cue-id]")?.focus();
    }
  };
  return (
    <div className={styles.row} style={{ top }} data-cue-id={id} data-index={index} role="option" aria-selected={selected} tabIndex={-1}>
      <span className={styles.times}>
        <span>{formatTimecode(cue.start, fps, mode)}</span>
        <span>{formatTimecode(cue.start + cue.duration, fps, mode)}</span>
      </span>
      <textarea
        ref={field}
        className={styles.text}
        value={text}
        rows={2}
        spellCheck={false}
        aria-label={`Cue ${index + 1} text`}
        placeholder="Caption"
        onFocus={() => {
          handled.current = false;
          pending.current = null;
          selectCue(id);
          setDraft(cue.text);
        }}
        onChange={(event) => {
          pending.current = event.target.value;
          setDraft(event.target.value);
          draftCue(id, event.target.value);
        }}
        onBlur={(event) => {
          if (!handled.current) commitCue(id, event.currentTarget.value);
          handled.current = false;
          pending.current = null;
          setDraft(null);
        }}
        onKeyDown={onKeyDown}
      />
      <span className={styles.count} data-tooltip="Words">
        {wordCount(text)}
      </span>
    </div>
  );
});

const selectFps = (project: Project) => project.settings.fps;

/** The cue ids shown for `query` (all of the track's when it is empty), as a key string. */
function shownSelector(query: string) {
  return (project: Project): string => {
    const track = captionTrackOf(project);
    if (!track) return "";
    if (query.trim() === "") return track.clipIds.join("\n");
    return track.clipIds.filter((id) => cueMatches((project.clips[id] as CaptionClip | undefined)?.text ?? "", query)).join("\n");
  };
}

/** The Captions tab body. */
export function CaptionsTab() {
  const hasTrack = useStoreSelector(documentStore, selectHasTrack);
  const hasAudio = useStoreSelector(documentStore, selectHasAudio);
  const total = useStoreSelector(documentStore, selectCueCount);
  const mode = useStoreSelector(sessionStore.state, selectMode);
  const selectedKey = useStoreSelector(sessionStore.selection, selectSelected);
  const [query, setQuery] = useState("");
  const shownKey = useStoreSelector(documentStore, useMemo(() => shownSelector(query), [query]));
  const shown = useMemo(() => (shownKey === "" ? EMPTY : shownKey.split("\n")), [shownKey]);
  const selected = useMemo(() => new Set(selectedKey === "" ? [] : selectedKey.split("\n")), [selectedKey]);
  const scroller = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState(0);
  const [view, setView] = useState({ block: 0, rows: BLOCK });
  // The cue whose text field has the focus: its row stays rendered while the list scrolls away from
  // it, so the field keeps the focus and the draft.
  const [editing, setEditing] = useState<ClipId | null>(null);

  // The row height (a design token) and the view's height in rows, from a ResizeObserver (P9).
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const height = Number.parseFloat(getComputedStyle(element).getPropertyValue("--cue-row-height")) || 1;
    setRowHeight(height);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setView((current) => ({ ...current, rows: Math.ceil(entry.contentRect.height / height) }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasTrack]);

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    if (rowHeight <= 0) return;
    const block = Math.floor(event.currentTarget.scrollTop / rowHeight / BLOCK);
    setView((current) => (current.block === block ? current : { ...current, block }));
  };

  /** Scrolls row `index` into view (when it is not). */
  const reveal = useCallback(
    (index: number) => {
      const element = scroller.current;
      if (!element || rowHeight <= 0 || index < 0) return;
      const top = index * rowHeight;
      if (top < element.scrollTop) element.scrollTop = top;
      else if (top + rowHeight > element.scrollTop + element.clientHeight) element.scrollTop = top + rowHeight - element.clientHeight;
    },
    [rowHeight],
  );

  // A cue to focus (after a split, a merge, Tab, + Cue) is scrolled to first, so its row exists.
  const focusId = useStoreSelector(cueFocus, (request) => request?.cueId ?? null);
  useEffect(() => {
    if (focusId !== null) reveal(shown.indexOf(focusId));
  }, [focusId, shown, reveal]);
  // A cue selected elsewhere (the timeline) comes into view.
  useEffect(() => {
    if (selected.size === 1) reveal(shown.indexOf([...selected][0] as string));
  }, [selected, shown, reveal]);

  // The cue under the playhead: marked on its row through the DOM (no React render while playing).
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let marked: string | null = null;
    const mark = () => {
      const project = documentStore.getState();
      const track = captionTrackOf(project);
      const playing = track ? (clipAtFrame(project, track.id, sessionStore.state.getState().playhead)?.id ?? null) : null;
      if (playing === marked && (playing === null || element.querySelector(`[data-cue-id="${CSS.escape(playing)}"][data-playing]`))) return;
      element.querySelector("[data-playing]")?.removeAttribute("data-playing");
      marked = playing;
      if (playing) element.querySelector(`[data-cue-id="${CSS.escape(playing)}"]`)?.setAttribute("data-playing", "");
    };
    mark();
    const stops = [sessionStore.state.select((state) => state.playhead, mark), documentStore.subscribe(mark, { affects: ["clips", "timeline"] })];
    return () => {
      for (const stop of stops) stop();
    };
  }, [view, shown]);

  // A right-click on a row (not in its text, which keeps the browser's text menu) selects the cue and opens its menu.
  const [menu, setMenu] = useState<{ cueId: ClipId; x: number; y: number } | null>(null);
  const onContextMenu = (event: MouseEvent) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-cue-id]") : null;
    if (!row || event.target instanceof HTMLTextAreaElement) return;
    event.preventDefault();
    const cueId = row.dataset.cueId as ClipId;
    selectCue(cueId);
    setMenu({ cueId, x: event.clientX, y: event.clientY });
  };
  const closeMenu = useCallback(() => setMenu(null), []);

  // A click on a row (not in its text) selects the cue and moves the playhead to it.
  const onClick = (event: MouseEvent) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-cue-id]") : null;
    if (!row || event.target instanceof HTMLTextAreaElement) return;
    selectCue(row.dataset.cueId as string);
    row.focus();
  };
  const onFocus = (event: FocusEvent) => {
    if (event.target instanceof HTMLTextAreaElement) setEditing(event.target.closest<HTMLElement>("[data-cue-id]")?.dataset.cueId ?? null);
  };
  const onBlur = (event: FocusEvent) => {
    if (event.target instanceof HTMLTextAreaElement) setEditing(null);
  };

  if (!hasTrack) return <NoCues hasTrack={false} hasAudio={hasAudio} />;

  const first = Math.max(0, (view.block - 1) * BLOCK);
  const last = Math.min(shown.length, (view.block + 1) * BLOCK + view.rows + BLOCK);
  const rows: { id: ClipId; index: number }[] = [];
  // The edited row outside the slice goes first: React then never moves its node (a move would blur it).
  const kept = editing === null ? -1 : shown.indexOf(editing);
  if (editing !== null && kept >= 0 && (kept < first || kept >= last)) rows.push({ id: editing, index: kept });
  for (let index = first; index < last; index++) rows.push({ id: shown[index] as ClipId, index });
  return (
    <div className={styles.root}>
      <div className={styles.tools}>
        <div className={styles.search}>
          <TextField value={query} onChange={setQuery} ariaLabel="Search cues" placeholder="Search cues" />
        </div>
        <span className={styles.total}>{query.trim() === "" ? `${total} cue${total === 1 ? "" : "s"}` : `${shown.length} of ${total}`}</span>
      </div>
      <div ref={scroller} className={styles.scroll} role="listbox" aria-label="Cues" onScroll={onScroll} onClick={onClick} onFocus={onFocus} onBlur={onBlur} onContextMenu={onContextMenu}>
        {total === 0 ? (
          <NoCues hasTrack hasAudio={hasAudio} />
        ) : shown.length === 0 ? (
          <EmptyState layout="inline" icon={SearchX} title="No cue matches" text={`Nothing matches “${query.trim()}”.`}>
            <Button control size="compact" onClick={() => setQuery("")}>
              Clear search
            </Button>
          </EmptyState>
        ) : (
          <div className={styles.spacer} style={{ height: shown.length * rowHeight }}>
            {rows.map(({ id, index }) => (
              <CueRow key={id} id={id} index={index} top={index * rowHeight} selected={selected.has(id)} mode={mode} order={shown} />
            ))}
          </div>
        )}
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} entries={cueMenuEntries(documentStore.getState(), menu.cueId)} onSelect={(id) => void actions.run(id, MEDIA_CONTEXT)} onClose={closeMenu} />}
    </div>
  );
}
