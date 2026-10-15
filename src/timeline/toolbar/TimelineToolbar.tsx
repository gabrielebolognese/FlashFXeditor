import { Ellipsis, Gauge } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { actions, sessionStore } from "../../app/services.js";
import { bindTimecode, bindZoomSlider, timelineDev } from "../../app/timelineController.js";
import type { SessionState } from "../../core/store/sessionStore.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { IconButton } from "../../ui/IconButton.js";
import { useDismiss } from "../../ui/useDismiss.js";
import styles from "./TimelineToolbar.module.css";
import { TOOLBAR_GROUPS, type ToolbarGroup, type ToolbarItem } from "./toolbarGroups.js";

// Actions stay disabled until their batches wire them (tools: 14/15/18, toggles: 16/35/37, edits:
// 15-19, add: 29/32/34, zoom to selection: 18, track height: 16).
const ENABLED: ReadonlySet<string> = new Set(["timeline.zoomOut", "timeline.zoomIn", "timeline.zoomFit"]);

/**
 * Toggle buttons whose pressed state is session state. Each subscribes to its own flag only (spec
 * §6.17): toggling re-renders that button, nothing else, and no drag ever writes these flags (hold S
 * inverts snapping without touching the session).
 * TODO(batch 16): linked selection. TODO(batch 35): clip keyframes. TODO(batch 37): audio scrub.
 */
const TOGGLE_STATE: Readonly<Record<string, (state: SessionState) => boolean>> = {
  "toggle.snap": (state) => state.snap,
  "toggle.rippleMode": (state) => state.ripple,
};

function SessionToggle({ item, pressedIn }: { item: Extract<ToolbarItem, { kind: "button" }>; pressedIn: (state: SessionState) => boolean }) {
  const pressed = useStoreSelector(sessionStore.state, pressedIn);
  return <IconButton icon={item.icon} label={item.label} commandId={item.id} pressed={pressed} onClick={() => actions.run(item.id)} />;
}

/** Rendered once; its value follows the zoom through direct DOM writes (no React render, P1). */
function ZoomSlider() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = ref.current;
    return input ? bindZoomSlider(input) : undefined;
  }, []);
  return <input ref={ref} type="range" className={styles.slider} aria-label="Timeline zoom" />;
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
      <input ref={inputRef} className={styles.timecode} aria-label="Playhead timecode" data-tooltip="Playhead (type a timecode, +30 or -15 frames, +2. seconds)" spellCheck={false} />
      <span ref={durationRef} className={styles.duration} data-tooltip="Duration" />
    </>
  );
}

const selectStats = (state: { stats: boolean }) => state.stats;
const toggleStats = () => timelineDev.set((state) => ({ stats: !state.stats }));

function DevStatsToggle() {
  const stats = useStoreSelector(timelineDev, selectStats);
  return <IconButton icon={Gauge} label="Timeline stats (dev)" pressed={stats} onClick={toggleStats} />;
}

function renderItem(item: ToolbarItem) {
  if (item.kind === "zoomSlider") return <ZoomSlider key="zoom-slider" />;
  const pressedIn = TOGGLE_STATE[item.id];
  if (pressedIn) return <SessionToggle key={item.id} item={item} pressedIn={pressedIn} />;
  const enabled = ENABLED.has(item.id);
  return (
    <IconButton
      key={item.id}
      icon={item.icon}
      label={item.label}
      commandId={item.id}
      text={item.text}
      pressed={item.toggle ? false : undefined}
      disabled={!enabled}
      onClick={enabled ? () => actions.run(item.id) : undefined}
    />
  );
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

    // Natural widths, measured once with everything visible.
    const widthOf = (element: Element | null) => element?.getBoundingClientRect().width ?? 0;
    const widths = groups.map(widthOf);
    const fixedWidth = widthOf(bar.querySelector("[data-end]"));
    const moreWidth = widthOf(more);
    const hideOrder = groups.map((_, i) => i).sort((a, b) => Number(groups[a]?.dataset.priority) - Number(groups[b]?.dataset.priority));

    const fit = (available: number) => {
      let total = widths.reduce((sum, w) => sum + w, fixedWidth);
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
  const closeOverflow = useCallback(() => setOverflow(null), []);
  useDismiss([menuRef, moreRef], closeOverflow, overflow !== null);

  return (
    <div ref={barRef} className={styles.bar} role="toolbar" aria-label="Timeline">
      {TOOLBAR_GROUPS.map((group) => (
        <Group key={group.id} group={group} />
      ))}
      <div ref={moreRef} className={styles.more}>
        <IconButton icon={Ellipsis} label="More tools" pressed={overflow !== null} onClick={overflow ? closeOverflow : openOverflow} />
      </div>
      <div className={styles.end} data-end="">
        {import.meta.env.DEV && <DevStatsToggle />}
        <Timecode />
      </div>
      {overflow &&
        createPortal(
          <div ref={menuRef} className={styles.overflowMenu} style={{ right: overflow.right, top: overflow.top }}>
            {overflow.groups.map((group) => (
              <Group key={group.id} group={group} />
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
