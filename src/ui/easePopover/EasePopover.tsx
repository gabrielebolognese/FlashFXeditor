import { ChevronDown } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { EASE_GROUPS, EASE_LABELS, keyEase } from "../../core/document/keyframes.js";
import type { EaseId } from "../../core/document/types.js";
import { commandBridge } from "../commands.js";
import { cx } from "../cx.js";
import menuStyles from "../MenuButton.module.css";
import { NumberField, useValueBinding } from "../NumberField.js";
import { useDismiss } from "../useDismiss.js";
import { BezierEditor } from "./BezierEditor.js";
import { curvePath, DEFAULT_BEZIER, holdPath, type Bezier } from "./curveMath.js";
import styles from "./EasePopover.module.css";

// The ease popover (spec §21.9, Batch 61): a searchable list of the eases in their groups, each with a
// curve thumbnail, under the Ease button. `Custom bezier` shows the curve editor and `Spring` its two
// fields inside the popover, and they stay shown while the key's ease is one of them. Panel chrome:
// the search is local React state; the curve editor's drags are not (BezierEditor writes the DOM).

export interface SpringParams {
  damping: number;
  frequency: number;
}

export interface EaseParams {
  bezier?: Bezier;
  spring?: SpringParams;
}

export interface EaseState extends EaseParams {
  /** The ease of the keys at the playhead; null when there is none or they differ. */
  ease: EaseId | null;
}

export interface EasePopoverProps {
  /** Accessible name and tooltip of the button. */
  label: string;
  disabled?: boolean | undefined;
  /** The button's text, written by the caller outside React (P1). */
  children?: ReactNode;
  /** Read when the popover opens. */
  current(): EaseState;
  onChange(ease: EaseId, params?: EaseParams): void;
}

export const DEFAULT_SPRING: Readonly<SpringParams> = { damping: 0.7, frequency: 4 };

const THUMB_W = 28;
const THUMB_H = 18;
const THUMB_PAD = 2;
const keepFocus = (event: MouseEvent) => event.preventDefault();

const thumbnails = new Map<EaseId, string>();

/** The thumbnail path of `ease` (cached; `bezier` and `spring` take `params` and are not). */
function thumbnailPath(ease: EaseId, params: EaseParams): string {
  const custom = ease === "bezier" || ease === "spring";
  const cached = custom ? undefined : thumbnails.get(ease);
  if (cached) return cached;
  let d: string;
  if (ease === "hold") d = holdPath(THUMB_W, THUMB_H, THUMB_PAD);
  else {
    const key = {
      frame: 0,
      value: 0,
      ease,
      ...(ease === "bezier" && { bezier: params.bezier ?? ([...DEFAULT_BEZIER] as Bezier) }),
      ...(ease === "spring" && { spring: params.spring ?? { ...DEFAULT_SPRING } }),
    };
    d = curvePath((t) => keyEase(key, t), THUMB_W, THUMB_H, THUMB_PAD);
  }
  if (!custom) thumbnails.set(ease, d);
  return d;
}

function Thumb({ ease, params }: { ease: EaseId; params: EaseParams }) {
  return (
    <svg className={styles.thumb} viewBox={`0 0 ${THUMB_W} ${THUMB_H}`} aria-hidden="true">
      <path d={thumbnailPath(ease, params)} />
    </svg>
  );
}

function BezierSection({ points, onCommit }: { points: Bezier; onCommit: (points: Bezier) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const commit = useRef(onCommit);
  useEffect(() => {
    commit.current = onCommit;
  });
  const [initial] = useState(points);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const editor = new BezierEditor(element, { points: initial, onCommit: (next) => commit.current(next) });
    return () => editor.destroy();
  }, [initial]);
  return <div ref={host} className={styles.editor} />;
}

function SpringSection({ spring, onChange }: { spring: SpringParams; onChange: (spring: SpringParams) => void }) {
  const [value, setValue] = useState(spring);
  const damping = useValueBinding(value.damping, (next) => {
    const merged = { ...value, damping: next };
    setValue(merged);
    onChange(merged);
  });
  const frequency = useValueBinding(value.frequency, (next) => {
    const merged = { ...value, frequency: next };
    setValue(merged);
    onChange(merged);
  });
  return (
    <div className={styles.spring}>
      <label className={styles.springField}>
        <span>Damping</span>
        <NumberField binding={damping} min={0.05} max={1} precision={2} step={0.05} ariaLabel="Spring damping" />
      </label>
      <label className={styles.springField}>
        <span>Frequency</span>
        <NumberField binding={frequency} min={0.5} max={20} precision={1} step={0.5} ariaLabel="Spring frequency" />
      </label>
    </div>
  );
}

interface BodyProps {
  x: number;
  y: number;
  anchorRef: RefObject<HTMLElement | null>;
  initial: EaseState;
  onChange: EasePopoverProps["onChange"];
  onClose: () => void;
}

function matches(ease: EaseId, group: string, query: string): boolean {
  if (query === "") return true;
  return [EASE_LABELS[ease], group, ease].some((text) => text.toLowerCase().includes(query));
}

function PopoverBody({ x, y, anchorRef, initial, onChange, onClose }: BodyProps) {
  const ref = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [ease, setEase] = useState<EaseId | null>(initial.ease);
  // The params the custom eases show: those of the key, else the defaults; they follow the edits.
  const [params, setParams] = useState<EaseParams>(() => ({ bezier: initial.bezier ?? ([...DEFAULT_BEZIER] as Bezier), spring: initial.spring ?? { ...DEFAULT_SPRING } }));

  const groups = useMemo(() => {
    const text = query.trim().toLowerCase();
    return EASE_GROUPS.map((group) => ({ label: group.label, eases: group.eases.filter((id) => matches(id, group.label, text)) })).filter((group) => group.eases.length > 0);
  }, [query]);

  // Position inside the viewport (a measurement on open and when an editor opens).
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    element.style.left = `${Math.max(0, Math.min(x, window.innerWidth - width))}px`;
    element.style.top = `${Math.max(0, Math.min(y, window.innerHeight - height))}px`;
  }, [x, y, ease]);

  // The keyboard comes to the popover while it is open and goes back where it was (as ContextMenu does).
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const bridge = commandBridge();
    const active = document.activeElement;
    const previous = active instanceof HTMLElement && active !== document.body && !element.contains(active) ? active : null;
    const scope = bridge.scope();
    search.current?.focus({ preventScroll: true });
    bridge.setScope("dialog");
    return () => {
      const now = document.activeElement;
      if (now !== null && now !== document.body && !element.contains(now)) return;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      else if (bridge.scope() === "dialog") bridge.setScope(scope);
    };
  }, []);

  useDismiss([ref, anchorRef], onClose);

  const pick = (id: EaseId) => {
    setEase(id);
    if (id === "bezier") {
      onChange(id, { bezier: params.bezier as Bezier });
      return;
    }
    if (id === "spring") {
      onChange(id, { spring: params.spring as SpringParams });
      return;
    }
    onChange(id);
    onClose();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button[data-ease]") ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const inSearch = document.activeElement === search.current;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // Only the search field and the rows take the arrows (the editors' fields and handles keep theirs).
      if (!inSearch && current < 0) return;
      event.preventDefault();
      if (event.key === "ArrowDown") (inSearch ? buttons[0] : buttons[current + 1])?.focus();
      else if (current <= 0) search.current?.focus();
      else buttons[current - 1]?.focus();
    } else if (event.key === "Enter" && inSearch) {
      event.preventDefault();
      const first = groups[0]?.eases[0];
      if (first) pick(first);
    }
  };

  return createPortal(
    <div ref={ref} className={styles.popover} role="dialog" aria-label="Ease" data-scope="dialog" onKeyDown={onKeyDown}>
      <input
        ref={search}
        className={styles.search}
        type="search"
        placeholder="Search eases"
        aria-label="Search eases"
        spellCheck={false}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className={styles.list} role="listbox" aria-label="Eases">
        {groups.length === 0 && <div className={styles.empty}>No ease matches</div>}
        {groups.map((group) => (
          <div key={group.label} role="group" aria-label={group.label}>
            <div className={styles.heading} role="presentation">
              {group.label}
            </div>
            {group.eases.map((id) => (
              <button key={id} type="button" role="option" aria-selected={ease === id} data-ease={id} className={cx(styles.row, ease === id && styles.active)} onMouseDown={keepFocus} onClick={() => pick(id)}>
                <Thumb ease={id} params={params} />
                <span className={styles.name}>{EASE_LABELS[id]}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {ease === "bezier" && (
        <div className={styles.custom}>
          <BezierSection
            points={params.bezier as Bezier}
            onCommit={(bezier) => {
              setParams((previous) => ({ ...previous, bezier }));
              onChange("bezier", { bezier });
            }}
          />
        </div>
      )}
      {ease === "spring" && (
        <div className={styles.custom}>
          <SpringSection
            spring={params.spring as SpringParams}
            onChange={(spring) => {
              setParams((previous) => ({ ...previous, spring }));
              onChange("spring", { spring });
            }}
          />
        </div>
      )}
    </div>,
    document.body,
  );
}

/** The Ease dropdown of a keyed section: a button opening the popover under it. */
export function EasePopover({ label, disabled, children, current, onChange }: EasePopoverProps) {
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState<{ x: number; y: number; initial: EaseState } | null>(null);
  const close = useMemo(() => () => setOpen(null), []);
  const toggle = () => {
    if (open) {
      close();
      return;
    }
    if (disabled) return;
    const element = button.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setOpen({ x: rect.left, y: rect.bottom, initial: current() });
  };
  return (
    <>
      <button
        ref={button}
        type="button"
        className={menuStyles.button}
        data-kind="value"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open !== null}
        aria-disabled={disabled || undefined}
        data-tooltip={label}
        onMouseDown={keepFocus}
        onClick={toggle}
      >
        {children !== undefined && <span className={menuStyles.text}>{children}</span>}
        <ChevronDown className={menuStyles.chevron} aria-hidden="true" />
      </button>
      {open && <PopoverBody x={open.x} y={open.y} anchorRef={button} initial={open.initial} onChange={onChange} onClose={close} />}
    </>
  );
}
