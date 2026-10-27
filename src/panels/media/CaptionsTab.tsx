import { Captions, Eraser, FileDown, FileUp, Mic, Paintbrush, Plus } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type UIEvent } from "react";
import { commitCue, cueFocus, draftCue, mergeCueIntoPrevious, selectCue, splitCueAtCaret, type CueFocus } from "../../app/captionController.js";
import { actions, documentStore, sessionStore } from "../../app/services.js";
import { formatTimecode, type TimecodeMode } from "../../core/document/time.js";
import type { CaptionClip, ClipId, Project } from "../../core/document/types.js";
import type { Selection } from "../../core/store/selection.js";
import type { SessionState } from "../../core/store/sessionStore.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { cueMatches, wordCount } from "../../text/captions.js";
import { captionTrackOf } from "../../timeline/edit/captions.js";
import { clipAtFrame } from "../../timeline/model/queries.js";
import { Button } from "../../ui/Button.js";
import { IconButton } from "../../ui/IconButton.js";
import { TextField } from "../../ui/TextField.js";
import styles from "./CaptionsTab.module.css";

// The Captions tab (spec §10.5, §12, §17 Captions header): the caption track's cue list. Each row shows
// the cue's in and out timecodes, its text (edited in place, shown live on the canvas) and its word
// count; a click selects the cue and puts the playhead on its start. While a text is edited: Enter
// splits the cue at the caret (Shift+Enter: a line break), Mod+Backspace at its start merges it into
// the previous cue, Tab / Shift+Tab go to the next / previous cue, Esc puts the text back. Delete
// deletes the selected cues (cutController). The list is virtualized: only the rows in view (and a
// block around them) exist, re-rendered when the view crosses a block of rows, not on every scroll
// step; the cue under the playhead is marked through the DOM (no React render while playing, P1).

/** Rows rendered beyond the view, and the scroll step that re-renders the list. */
const BLOCK = 16;
const EMPTY: readonly ClipId[] = [];

const selectHasTrack = (project: Project) => captionTrackOf(project) !== null;
const selectCueCount = (project: Project) => captionTrackOf(project)?.clipIds.length ?? 0;
const selectMode = (state: SessionState) => state.timecodeFormat;
/** The selected cue ids, as a key string (the list renders when it changes). */
const selectSelected = (selection: Selection) => (selection.kind === "clips" ? [...selection.clipIds].join("\n") : "");

/** Header actions of the Captions tab (spec §17): + Cue, Import, Export, Style, Transcribe, Clear. */
export function CaptionsActions() {
  const hasTrack = useStoreSelector(documentStore, selectHasTrack);
  const count = useStoreSelector(documentStore, selectCueCount);
  return (
    <>
      <IconButton icon={Plus} label="Add a 2 s cue at the playhead" commandId="captions.addCue" onClick={() => actions.run("captions.addCue")} />
      <IconButton icon={FileUp} label="Import SRT or VTT (replaces the cues)" commandId="captions.import" onClick={() => actions.run("captions.import")} />
      <IconButton icon={FileDown} label="Export SRT or VTT" commandId="captions.export" disabled={count === 0} onClick={() => actions.run("captions.export")} />
      <IconButton icon={Paintbrush} label="Caption style (in Edit Properties)" commandId="captions.style" disabled={!hasTrack} onClick={() => actions.run("captions.style")} />
      {/* TODO(batch 33): Transcribe (local Whisper in transcribe.worker.ts, spec §10.6). */}
      <IconButton icon={Mic} label="Transcribe: coming in Batch 33" disabled />
      <IconButton icon={Eraser} label="Clear all cues" commandId="captions.clear" disabled={count === 0} onClick={() => actions.run("captions.clear")} />
    </>
  );
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
          selectCue(id);
          setDraft(cue.text);
        }}
        onChange={(event) => {
          setDraft(event.target.value);
          draftCue(id, event.target.value);
        }}
        onBlur={(event) => {
          if (!handled.current) commitCue(id, event.currentTarget.value);
          handled.current = false;
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

  // A click on a row (not in its text) selects the cue and moves the playhead to it.
  const onClick = (event: MouseEvent) => {
    const row = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-cue-id]") : null;
    if (!row || event.target instanceof HTMLTextAreaElement) return;
    selectCue(row.dataset.cueId as string);
    row.focus();
  };

  if (!hasTrack) {
    return (
      <div className={styles.empty}>
        <Captions className={styles.emptyIcon} aria-hidden="true" />
        <p className={styles.emptyTitle}>No captions yet</p>
        <p className={styles.emptyText}>Add a cue at the playhead, or import an SRT or VTT file.</p>
        <div className={styles.emptyActions}>
          <Button variant="primary" icon={Plus} commandId="captions.addCue" onClick={() => actions.run("captions.addCue")}>
            Cue at playhead
          </Button>
          <Button icon={FileUp} commandId="captions.import" onClick={() => actions.run("captions.import")}>
            Import SRT/VTT
          </Button>
        </div>
      </div>
    );
  }

  const first = Math.max(0, (view.block - 1) * BLOCK);
  const last = Math.min(shown.length, (view.block + 1) * BLOCK + view.rows + BLOCK);
  const rows: ClipId[] = shown.slice(first, last) as ClipId[];
  return (
    <div className={styles.root}>
      <div className={styles.tools}>
        <div className={styles.search}>
          <TextField value={query} onChange={setQuery} ariaLabel="Search cues" placeholder="Search cues" />
        </div>
        <span className={styles.total}>{query.trim() === "" ? `${total} cue${total === 1 ? "" : "s"}` : `${shown.length} of ${total}`}</span>
      </div>
      <div ref={scroller} className={styles.scroll} role="listbox" aria-label="Cues" onScroll={onScroll} onClick={onClick}>
        {shown.length === 0 ? (
          <p className={styles.note}>{total === 0 ? "No cues yet. Click + to add one at the playhead." : "No cue matches the search."}</p>
        ) : (
          <div className={styles.spacer} style={{ height: shown.length * rowHeight }}>
            {rows.map((id, i) => (
              <CueRow key={id} id={id} index={first + i} top={(first + i) * rowHeight} selected={selected.has(id)} mode={mode} order={shown} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
