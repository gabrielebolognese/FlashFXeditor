import { SwatchBook } from "lucide-react";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import {
  canWrite,
  findPreset,
  hoverPreset,
  movePresetInSet,
  presetLibrary,
  presetNaming,
  presetSourceClip,
  presetThumbs,
  setPresetBarScroller,
  type PresetLibrary,
} from "../app/presetController.js";
import { actions, appSettings, sessionStore, themeBridge } from "../app/services.js";
import type { TextPreset } from "../core/document/types.js";
import { isEditableTarget } from "../core/keyboard/KeyDispatcher.js";
import type { SessionState } from "../core/store/sessionStore.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { allPresets, presetSetChoices, presetSetLabel, presetsInSet, reorderableSet, setTag, type PresetSetKey } from "../text/presets.js";
import { STARTER_TAGS } from "../text/starterPresets.js";
import { ContextMenu } from "../ui/ContextMenu.js";
import { IconButton } from "../ui/IconButton.js";
import { Select } from "../ui/Select.js";
import { PresetNameField } from "./media/PresetNameField.js";
import { presetMenuEntries } from "./media/presetMenu.js";
import { pressWithoutFocus, setTabStop } from "./media/listNavigation.js";
import styles from "./PresetBar.module.css";

// The preset bar (spec §20.2, Batch 52): one row at the top of the preview panel, under its header.
// Left: the set selector; then the row of visual buttons, each its preset drawn by the text engine (a
// bitmap from the thumbnail service, painted in the FrameScheduler loop) with arrows at both ends;
// right: `+` (Save as preset into the shown set) and Manage (the Presets tab). A click applies the
// preset (to the selected text clips, the caption track, or a new text clip edited inline), hovering
// previews it on the selection, a right-click opens the card menu, a drag reorders the set, the wheel
// and the arrows scroll the row. React renders the bar when the presets, the set or its order change;
// hover, scrolling, the arrows' state and reorder drags write the DOM directly (no React commit), and
// the selection is read by `+` alone.

const BUTTON = "[data-preset-id]";
const selectBar = (state: SessionState) => state.presetBar;
const selectGlobal = (library: PresetLibrary) => library.global;
const selectProject = (library: PresetLibrary) => library.project;
const selectLoaded = (library: PresetLibrary) => library.loaded;
const presetIdOf = (target: EventTarget | null) => (target instanceof Element ? (target.closest<HTMLElement>(BUTTON)?.dataset.presetId ?? null) : null);

/** A button: the preset's thumbnail on the neutral swatch; its first nine carry Alt+1..9 (the tooltip shows the key). */
const BarButton = memo(function BarButton({ preset, index }: { preset: TextPreset; index: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    // The observer reports the size once at the start, then on every change (P9: no layout reads here).
    const observer = new ResizeObserver(([entry]) => {
      if (entry) presetThumbs.resize(canvas, entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      presetThumbs.detach(canvas);
    };
  }, []);
  useEffect(() => {
    if (ref.current) presetThumbs.show(ref.current, preset, themeBridge.theme.space[1]);
  }, [preset]);
  return (
    <button
      type="button"
      className={styles.button}
      data-preset-id={preset.id}
      data-command={index < 9 ? `presetBar.apply${index + 1}` : "preset.apply"}
      aria-label={preset.name}
      data-tooltip={preset.name}
      tabIndex={-1}
    >
      <canvas ref={ref} className={styles.thumb} aria-hidden="true" />
    </button>
  );
});

/** `+` (spec §20.2): Save as preset into the shown set; the only part of the bar that follows the selection. */
function AddButton({ set }: { set: PresetSetKey }) {
  const hasText = useStoreSelector(sessionStore.selection, () => presetSourceClip() !== null);
  const label = hasText ? `Save the selected text as a preset in ${presetSetLabel(set)}` : "Save as preset: select a text clip first";
  return <IconButton commandId="presetBar.add" label={label} disabled={!hasText} />;
}

function emptyText(set: PresetSetKey, loaded: boolean): string {
  if (!loaded) return "Loading presets…";
  if (set === "favorites") return "No favorites yet: right-click a preset (Manage opens them all) and check Favorites.";
  if (set === "recent") return "The presets you apply show here.";
  return `No presets in ${presetSetLabel(set)} yet.`;
}

/** A reorder drag in progress (spec §20.2 "dragging a button reorders it"): direct DOM, one write per move. */
interface Reorder {
  id: string;
  pointerId: number;
  startX: number;
  /** Read once when the drag starts (P9), in the row's content px: the button middles and where each gap's marker goes. */
  layout: { left: number; middles: number[]; gaps: number[] } | null;
  gap: number;
}

export function PresetBar() {
  const { visible, set } = useStoreSelector(sessionStore.state, selectBar);
  if (!visible) return null;
  return <PresetBarRow set={set} />;
}

function PresetBarRow({ set }: { set: PresetSetKey }) {
  const global = useStoreSelector(presetLibrary, selectGlobal);
  const project = useStoreSelector(presetLibrary, selectProject);
  const loaded = useStoreSelector(presetLibrary, selectLoaded);
  const recent = useStoreSelector(appSettings, (settings) => (set === "recent" ? settings.recentPresets : null));
  const order = useStoreSelector(appSettings, (settings) => settings.presetOrder[set]);
  const defaultTitle = useStoreSelector(appSettings, (settings) => settings.defaultTitlePreset);
  const defaultSubtitle = useStoreSelector(appSettings, (settings) => settings.defaultSubtitlePreset);
  const naming = useStoreSelector(presetNaming, (where) => where === "bar");
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const presets = useMemo(() => presetsInSet(global, project, set, { recent: recent ?? [], order }), [set, global, project, recent, order]);
  const choices = useMemo(() => {
    const list = presetSetChoices(allPresets(global, project), STARTER_TAGS);
    // A user set whose last preset lost its tag stays shown until another set is chosen.
    if (!list.some((choice) => choice.key === set)) list.push({ key: set, label: setTag(set) ?? presetSetLabel(set) });
    return list.map((choice) => ({ value: choice.key, label: choice.label }));
  }, [global, project, set]);

  const rowRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLSpanElement>(null);
  const rightRef = useRef<HTMLSpanElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const reorder = useRef<Reorder | null>(null);
  const clickTaken = useRef(false);

  // The arrows are disabled at the ends (never hidden: nothing shifts), written to the DOM on scroll.
  const updateArrows = () => {
    const row = rowRef.current;
    if (!row) return;
    const atStart = row.scrollLeft <= 0;
    const atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 1;
    leftRef.current?.querySelector("button")?.toggleAttribute("aria-disabled", atStart);
    rightRef.current?.querySelector("button")?.toggleAttribute("aria-disabled", atEnd);
  };

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;
    // A vertical wheel scrolls the row sideways (it never wraps).
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      row.scrollLeft += event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * themeBridge.theme.space[5] : event.deltaY;
    };
    row.addEventListener("wheel", onWheel, { passive: false });
    const observer = new ResizeObserver(updateArrows);
    observer.observe(row);
    // The arrows scroll by the row's width less one button.
    setPresetBarScroller((direction) => {
      const button = row.querySelector<HTMLElement>(BUTTON);
      const step = Math.max(button?.offsetWidth ?? 0, row.clientWidth - (button?.offsetWidth ?? 0));
      row.scrollBy({ left: direction * step, behavior: "smooth" });
    });
    return () => {
      row.removeEventListener("wheel", onWheel);
      observer.disconnect();
      setPresetBarScroller(null);
      hoverPreset(null);
      if (presetNaming.getState() === "bar") presetNaming.set(null);
    };
  }, []);

  // The focused button is the row's one Tab stop (the first until one was focused); the arrows follow the content.
  const tabStop = useRef<string | null>(null);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (row) setTabStop(row, BUTTON, tabStop.current === null ? null : row.querySelector(`[data-preset-id="${CSS.escape(tabStop.current)}"]`));
    updateArrows();
  });

  const onClick = (event: MouseEvent) => {
    if (clickTaken.current) {
      clickTaken.current = false;
      return;
    }
    const id = presetIdOf(event.target);
    if (id) actions.run("preset.apply", null, id);
  };
  const onMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    const button = (event.target as Element).closest<HTMLElement>(BUTTON);
    if (button && !isEditableTarget(event.target)) pressWithoutFocus(event, event.currentTarget, button, BUTTON);
  };
  const onContextMenu = (event: MouseEvent) => {
    const id = presetIdOf(event.target);
    if (!id) return;
    event.preventDefault();
    hoverPreset(null);
    setMenu({ id, x: event.clientX, y: event.clientY });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const button = (event.target as Element).closest<HTMLElement>(BUTTON);
    const row = rowRef.current;
    if (!button || !row || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      const id = button.dataset.presetId;
      if (id && !event.repeat) actions.run("preset.apply", null, id);
      return;
    }
    const buttons = [...row.querySelectorAll<HTMLElement>(BUTTON)];
    const index = buttons.indexOf(button);
    const next = event.key === "ArrowLeft" ? index - 1 : event.key === "ArrowRight" ? index + 1 : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    const target = buttons[Math.max(0, Math.min(buttons.length - 1, next))];
    target?.focus();
    target?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const onFocus = (event: FocusEvent) => {
    const button = (event.target as Element).closest<HTMLElement>(BUTTON);
    if (!button || !rowRef.current) return;
    tabStop.current = button.dataset.presetId ?? null;
    setTabStop(rowRef.current, BUTTON, button);
  };

  // Hover previews the preset on the selection (presetController writes the live edit, no React render).
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = reorder.current;
    if (drag) {
      moveReorder(event, drag);
      return;
    }
    hoverPreset(presetIdOf(event.target));
  };

  // Reordering (spec §20.2): a press and a move past the drag threshold; the marker shows the gap.
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !reorderableSet(set)) return;
    const id = presetIdOf(event.target);
    if (id) reorder.current = { id, pointerId: event.pointerId, startX: event.clientX, layout: null, gap: -1 };
  };
  const moveReorder = (event: PointerEvent<HTMLDivElement>, drag: Reorder) => {
    const row = rowRef.current;
    const marker = markerRef.current;
    if (!row || !marker || event.pointerId !== drag.pointerId) return;
    if (!drag.layout) {
      if (Math.abs(event.clientX - drag.startX) < themeBridge.theme.timeline.dragThreshold) return;
      // The drag starts: the hover preview ends, the row keeps the pointer, the positions are read once.
      hoverPreset(null);
      row.setPointerCapture(event.pointerId);
      const buttons = [...row.querySelectorAll<HTMLElement>(BUTTON)];
      const ends = buttons.map((button) => ({ left: button.offsetLeft, right: button.offsetLeft + button.offsetWidth }));
      drag.layout = {
        left: row.getBoundingClientRect().left,
        middles: ends.map((end) => (end.left + end.right) / 2),
        gaps: [...ends.map((end) => end.left), ends.at(-1)?.right ?? 0],
      };
      row.querySelector<HTMLElement>(`[data-preset-id="${CSS.escape(drag.id)}"]`)?.setAttribute("data-dragging", "");
      marker.hidden = false;
    }
    const x = event.clientX - drag.layout.left + row.scrollLeft;
    const gap = drag.layout.middles.filter((middle) => middle < x).length;
    if (gap === drag.gap) return;
    drag.gap = gap;
    marker.style.transform = `translateX(${drag.layout.gaps[gap] ?? 0}px)`;
  };
  const endReorder = (commit: boolean) => {
    const drag = reorder.current;
    reorder.current = null;
    if (!drag?.layout) return;
    rowRef.current?.querySelector("[data-dragging]")?.removeAttribute("data-dragging");
    if (markerRef.current) markerRef.current.hidden = true;
    // The release of a drag is no click.
    clickTaken.current = true;
    if (commit && drag.gap >= 0) movePresetInSet(set, drag.id, drag.gap);
  };

  const menuPreset = menu ? (presets.find((preset) => preset.id === menu.id) ?? findPreset(menu.id)?.preset) : undefined;
  const menuScope = menu ? findPreset(menu.id)?.scope : undefined;

  return (
    <div className={styles.bar} data-preset-bar="">
      <div className={styles.set}>
        <Select size="compact" label="Preset bar set" tooltip="The presets the bar shows" value={set} options={choices} onChange={(key) => actions.run("presetBar.showSet", null, key)} />
      </div>
      <span ref={leftRef} className={styles.arrow}>
        <IconButton commandId="presetBar.scrollLeft" label="Scroll the presets left" />
      </span>
      <div
        ref={rowRef}
        className={styles.row}
        role="toolbar"
        aria-label={`Preset bar: ${presetSetLabel(set)}`}
        onClick={onClick}
        onMouseDown={onMouseDown}
        onContextMenu={onContextMenu}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => endReorder(true)}
        onPointerCancel={() => endReorder(false)}
        onLostPointerCapture={() => endReorder(true)}
        onPointerLeave={() => {
          if (!reorder.current) hoverPreset(null);
        }}
        onScroll={() => {
          if (!reorder.current) hoverPreset(null);
          updateArrows();
        }}
      >
        {naming ? (
          <div className={styles.naming}>
            <PresetNameField bar />
          </div>
        ) : presets.length === 0 ? (
          <span className={styles.empty}>{emptyText(set, loaded)}</span>
        ) : (
          presets.map((preset, index) => <BarButton key={preset.id} preset={preset} index={index} />)
        )}
        <div ref={markerRef} className={styles.marker} hidden aria-hidden="true" />
      </div>
      <span ref={rightRef} className={styles.arrow}>
        <IconButton commandId="presetBar.scrollRight" label="Scroll the presets right" />
      </span>
      <AddButton set={set} />
      <IconButton commandId="panel.presets" icon={SwatchBook} label="Manage presets (the Presets tab)" />
      {menu && menuPreset && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          entries={presetMenuEntries(menuPreset, menuScope ? canWrite(menuScope) : false, { title: defaultTitle, subtitle: defaultSubtitle })}
          onSelect={(command) => actions.run(command, null, menu.id)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
