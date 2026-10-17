import { Search } from "lucide-react";
import { createElement, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { closePalette, commandPalette, paletteRows, runFromPalette, type PaletteRow } from "../app/commandController.js";
import { keymap } from "../core/keyboard/keymap.js";
import { detectPlatform, eventChords, parseChord } from "../core/keyboard/keys.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { cx } from "../ui/cx.js";
import { useDismiss } from "../ui/useDismiss.js";
import styles from "./CommandPalette.module.css";

// The command palette (Batch 40, spec §18 Mod+Shift+P): every command of the catalog the registry has,
// found by fuzzy search over its name, category and search words ("compact" finds Close all gaps), with
// its live shortcut; recent commands first. Up / Down move, Enter runs (in the panel that had the
// keyboard), Escape or the palette's key again closes. A dialog, rendered only while open; hovering a
// row is CSS only (P1).

const keepFocus = (event: MouseEvent) => event.preventDefault();

function Row({ row, active, onRun }: { row: PaletteRow; active: boolean; onRun: (id: string) => void }) {
  return (
    <div
      className={cx(styles.row, active && styles.active)}
      role="option"
      aria-selected={active}
      aria-disabled={!row.enabled || undefined}
      data-command={row.id}
      data-palette-row=""
      onMouseDown={keepFocus}
      onClick={() => onRun(row.id)}
    >
      <span className={styles.icon} aria-hidden="true">
        {row.icon && createElement(row.icon, { className: styles.glyph })}
      </span>
      <span className={styles.label}>{row.label}</span>
      <span className={styles.category}>{row.category}</span>
      {row.keys !== "" && <kbd className={styles.keys}>{row.keys}</kbd>}
    </div>
  );
}

function Palette() {
  const ref = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rows = useMemo(() => paletteRows(query), [query]);
  const index = Math.min(active, Math.max(0, rows.length - 1));
  const current = rows[index];

  useDismiss([ref], closePalette);

  // Keep the active row in view (one scroll per move).
  useLayoutEffect(() => {
    list.current?.querySelectorAll("[data-palette-row]")[index]?.scrollIntoView({ block: "nearest" });
  }, [index, rows]);

  const run = (id: string) => {
    const row = rows.find((candidate) => candidate.id === id);
    if (row?.enabled) runFromPalette(id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    const count = rows.length;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (count > 0) setActive((index + (event.key === "ArrowDown" ? 1 : count - 1)) % count);
    } else if (event.key === "PageDown" || event.key === "PageUp") {
      event.preventDefault();
      setActive(Math.max(0, Math.min(count - 1, index + (event.key === "PageDown" ? 8 : -8))));
    } else if (event.key === "Enter") {
      event.preventDefault();
      // The dispatcher on window must not see this Enter after the palette closed (it would edit a text).
      event.stopPropagation();
      if (current) run(current.id);
    } else {
      // The palette's own key closes it (the input owns its keys, so the dispatcher never sees it).
      const platform = detectPlatform();
      const own = keymap.keysFor("app.commandPalette").map((keys) => parseChord(keys, platform));
      if (eventChords(event).some((chord) => own.includes(chord))) {
        event.preventDefault();
        closePalette();
      }
    }
  };

  return createPortal(
    <div ref={ref} className={styles.palette} role="dialog" aria-label="Command palette" data-scope="dialog">
      <label className={styles.search}>
        <Search aria-hidden="true" />
        <input
          type="text"
          value={query}
          placeholder="Type a command"
          aria-label="Search commands"
          aria-controls="command-palette-list"
          spellCheck={false}
          autoFocus
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </label>
      <div ref={list} id="command-palette-list" className={styles.list} role="listbox" aria-label="Commands">
        {rows.length === 0 ? <p className={styles.empty}>No command matches “{query.trim()}”.</p> : rows.map((row, i) => <Row key={row.id} row={row} active={i === index} onRun={run} />)}
      </div>
      <div className={styles.footer}>
        <span>↑↓ move</span>
        <span>Enter run</span>
        <span>Esc close</span>
        {current && !current.enabled && <span className={styles.unavailable}>{current.label}: not available now</span>}
      </div>
    </div>,
    document.body,
  );
}

/** Rendered by the app; shows the palette only while it is open. */
export function CommandPalette() {
  const open = useStoreSelector(commandPalette, (state) => state !== null);
  return open ? <Palette /> : null;
}
