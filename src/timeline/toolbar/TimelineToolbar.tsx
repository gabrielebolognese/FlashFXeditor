import { Ellipsis } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { actions, documentStore, sessionStore } from "../../app/services.js";
import { bindTimecode, bindZoomSlider, timelineDev } from "../../app/timelineController.js";
import type { Project } from "../../core/document/types.js";
import type { SessionState } from "../../core/store/sessionStore.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { IconButton } from "../../ui/IconButton.js";
import { useDismiss } from "../../ui/useDismiss.js";
import styles from "./TimelineToolbar.module.css";
import { TOOLBAR_GROUPS, type ToolbarGroup, type ToolbarItem } from "./toolbarGroups.js";


/**
 * Toggle buttons whose pressed state is session state: the toggles and the active tool. Each
 * subscribes to its own flag only (spec §6.17): toggling re-renders that button (a tool change, the
 * two tool buttons), nothing else, and no drag ever writes these flags (hold S inverts snapping
 * without touching the session).
 */
const TOGGLE_STATE: Readonly<Record<string, (state: SessionState) => boolean>> = {
  "toggle.snap": (state) => state.snap,
  "toggle.linkedSelection": (state) => state.linkedSelection,
  "toggle.rippleMode": (state) => state.ripple,
  "toggle.clipKeyframes": (state) => state.clipKeyframes,
  "toggle.audioScrub": (state) => state.audioScrub,
  "tool.select": (state) => state.activeTool === "select",
  "tool.razor": (state) => state.activeTool === "razor",
  "tool.hand": (state) => state.activeTool === "hand",
  "tool.slip": (state) => state.activeTool === "slip",
  "tool.slide": (state) => state.activeTool === "slide",
  "tool.rateStretch": (state) => state.activeTool === "rateStretch",
};

function SessionToggle({ item, pressedIn }: { item: Extract<ToolbarItem, { kind: "button" }>; pressedIn: (state: SessionState) => boolean }) {
  const pressed = useStoreSelector(sessionStore.state, pressedIn);
  return <IconButton label={item.label} commandId={item.id} pressed={pressed} />;
}

/** Rendered once; its value follows the zoom through direct DOM writes (no React render, P1). */
function ZoomSlider() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = ref.current;
    return input ? bindZoomSlider(input) : undefined;
  }, []);
  return <input ref={ref} type="range" className={styles.slider} aria-label="Timeline zoom" data-tooltip="Timeline zoom" />;
}

/** Playhead timecode (editable) and total duration, written by subscriptions, never by React. */
function Timecode() {
  const inputRef = useRef<HTMLInputElement>(null);
  const durationRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const [input, duration] = [inputRef.current, durationRef.current];
    return input && duration ? bindTimecode(input, duration) : undefined;
  }, []);
  return (
    <>
      <input
        ref={inputRef}
        className={styles.timecode}
        aria-label="Playhead timecode"
        data-tooltip="Playhead: type a timecode (1:05:10), +30 or -15 frames, +2. seconds; Enter jumps, Esc cancels"
        spellCheck={false}
      />
      <span ref={durationRef} className={styles.duration} data-tooltip="Duration" />
    </>
  );
}

const selectStats = (state: { stats: boolean }) => state.stats;

function DevStatsToggle() {
  const stats = useStoreSelector(timelineDev, selectStats);
  return <IconButton commandId="dev.toggleTimelineStats" label="Timeline stats (dev)" pressed={stats} />;
}

const selectHasCaptions = (project: Project) => project.tracks.some((track) => track.kind === "caption");

/** `+ Caption track` (spec §17): disabled once the project has its one caption track (never hidden). */
function CaptionTrackButton({ item }: { item: Extract<ToolbarItem, { kind: "button" }> }) {
  const has = useStoreSelector(documentStore, selectHasCaptions);
  return <IconButton label={has ? "Caption track: the project has one (Media > Captions)" : item.label} commandId={item.id} disabled={has} />;
}

function renderItem(item: ToolbarItem) {
  if (item.kind === "zoomSlider") return <ZoomSlider key="zoom-slider" />;
  if (item.id === "add.captionTrack") return <CaptionTrackButton key={item.id} item={item} />;
  const pressedIn = TOGGLE_STATE[item.id];
  if (pressedIn) return <SessionToggle key={item.id} item={item} pressedIn={pressedIn} />;
  // A command a later batch builds stays disabled (never hidden: the row never shifts).
  return <IconButton key={item.id} label={item.label} commandId={item.id} text={item.text} pressed={item.toggle ? false : undefined} disabled={!actions.has(item.id)} />;
}

function Group({ group }: { group: ToolbarGroup }) {
  return (
    <div className={styles.group} data-group={group.id} data-priority={group.priority} role="group" aria-label={group.label}>
      {group.items.map(renderItem)}
    </div>
  );
}

/**
 * One row that never wraps (spec §6.1). When it overflows, the lowest-priority groups are hidden and
 * listed under a "..." button. Fitting runs from a ResizeObserver with direct DOM writes (no React
 * render while a splitter is dragged).
 */
export function TimelineToolbar() {
  const barRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<{ groups: readonly ToolbarGroup[]; right: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    const more = moreRef.current;
    if (!bar || !more) return;
    const groups = [...bar.querySelectorAll<HTMLElement>("[data-group]")];
    for (const group of groups) group.hidden = false;
    more.hidden = false;

    const slider = bar.querySelector<HTMLInputElement>('[data-group="zoom"] input[type="range"]');
    if (slider) slider.hidden = false;
    // Natural widths, measured once with everything visible.
    const widthOf = (element: Element | null) => element?.getBoundingClientRect().width ?? 0;
    const widths = groups.map(widthOf);
    const sliderStyle = slider ? getComputedStyle(slider) : null;
    const sliderWidth = slider && sliderStyle ? widthOf(slider) + parseFloat(sliderStyle.marginLeft) + parseFloat(sliderStyle.marginRight) : 0;
    const fixedWidth = widthOf(bar.querySelector("[data-end]"));
    const moreWidth = widthOf(more);
    const hideOrder = groups.map((_, i) => i).sort((a, b) => Number(groups[a]?.dataset.priority) - Number(groups[b]?.dataset.priority));

    const fit = (available: number) => {
      let total = widths.reduce((sum, w) => sum + w, fixedWidth);
      // The zoom slider goes first (Batch 46, the Batch 07 follow-up): Zoom -, + and Fit stay on the row
      // at widths where the whole group would have gone into "...".
      const compact = slider !== null && total > available;
      if (slider) slider.hidden = compact;
      if (compact) total -= sliderWidth;
      const hidden = new Set<number>();
      for (const index of hideOrder) {
        if (total <= available) break;
        if (hidden.size === 0) total += moreWidth;
        hidden.add(index);
        total -= widths[index] ?? 0;
      }
      groups.forEach((group, index) => {
        group.hidden = hidden.has(index);
      });
      more.hidden = hidden.size === 0;
    };

    const observer = new ResizeObserver(([entry]) => {
      if (entry) fit(entry.contentRect.width);
    });
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  const openOverflow = () => {
    const bar = barRef.current;
    const more = moreRef.current;
    if (!bar || !more) return;
    const hiddenIds = new Set(
      [...bar.querySelectorAll<HTMLElement>("[data-group]")].filter((g) => g.hidden).map((g) => g.dataset.group),
    );
    const rect = more.getBoundingClientRect();
    setOverflow({
      groups: TOOLBAR_GROUPS.filter((g) => hiddenIds.has(g.id)),
      right: window.innerWidth - rect.right,
      top: rect.bottom,
    });
  };
  const closeOverflow = useCallback(() => {
    // Closed from the keyboard (Escape) with the focus inside: back to the More button (Batch 46).
    if (menuRef.current?.contains(document.activeElement)) moreRef.current?.querySelector("button")?.focus();
    setOverflow(null);
  }, []);
  useDismiss([menuRef, moreRef], closeOverflow, overflow !== null);
  // The menu takes the focus when it opens, so the keyboard reaches the groups it holds.
  const opened = overflow !== null;
  useEffect(() => {
    if (opened) menuRef.current?.querySelector<HTMLElement>("button, input")?.focus();
  }, [opened]);
  // Tab cycles inside the open menu (it is portalled to the end of the page, so Tab would leave the app).
  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab" || !menuRef.current) return;
    const items = [...menuRef.current.querySelectorAll<HTMLElement>("button, input")];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div ref={barRef} className={styles.bar} role="toolbar" aria-label="Timeline">
      {TOOLBAR_GROUPS.map((group) => (
        <Group key={group.id} group={group} />
      ))}
      <div ref={moreRef} className={styles.more}>
        <IconButton icon={Ellipsis} label="More tools" control pressed={overflow !== null} onClick={overflow ? closeOverflow : openOverflow} />
      </div>
      <div className={styles.end} data-end="">
        {import.meta.env.DEV && <DevStatsToggle />}
        <Timecode />
      </div>
      {overflow &&
        createPortal(
          <div ref={menuRef} className={styles.overflowMenu} style={{ right: overflow.right, top: overflow.top }} role="group" aria-label="More tools" onKeyDown={onMenuKey}>
            {overflow.groups.map((group) => (
              <Group key={group.id} group={group} />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
