import { Ellipsis } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "../../ui/IconButton.js";
import { useDismiss } from "../../ui/useDismiss.js";
import styles from "./TimelineToolbar.module.css";
import { TOOLBAR_GROUPS, type ToolbarGroup, type ToolbarItem } from "./toolbarGroups.js";

// All actions are disabled until their batches wire them (tools: 11/13/14, toggles: 11/12,
// edits: 13-19, add: 29/32/34, zoom and timecode: 07/18).

function renderItem(item: ToolbarItem) {
  if (item.kind === "zoomSlider") {
    return <input key="zoom-slider" type="range" className={styles.slider} aria-label="Timeline zoom" disabled />;
  }
  return (
    <IconButton
      key={item.id}
      icon={item.icon}
      label={item.label}
      commandId={item.id}
      text={item.text}
      pressed={item.toggle ? false : undefined}
      disabled
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
        {/* TODO(batch 07): live playhead timecode, editable; total duration. */}
        <span className={styles.timecode} data-tooltip="Playhead">
          00:00:00
        </span>
        <span className={styles.duration} data-tooltip="Duration">
          00:00:00
        </span>
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
