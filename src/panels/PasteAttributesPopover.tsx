import { Check } from "lucide-react";
import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { applyPasteAttributes, closePasteAttributes, pasteAttributesMenu, uncheckedGroups, type PasteAttributesMenu } from "../app/clipboardController.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { ATTRIBUTE_LABELS, type AttributeGroup } from "../timeline/edit/pasteAttributes.js";
import { Button } from "../ui/Button.js";
import { cx } from "../ui/cx.js";
import { useDismiss } from "../ui/useDismiss.js";
import styles from "./PasteAttributesPopover.module.css";

// Paste attributes (spec §18 Mod+Alt+V, Batch 39): a small floating checklist of the groups the copied
// clip can give the selected clips, at the menu row that opened it or over the focused panel. Every
// group starts checked except those unchecked earlier this session; Keyframes (how the animatable
// groups arrive) is dimmed while none of them is checked. Enter or Paste applies (one undo step),
// Escape, Cancel or a press outside close it; Up / Down move between the rows and buttons, Space
// toggles a row (Batch 40). Rendered only while open (a dialog, not a P1 path).

const ANIMATED: ReadonlySet<AttributeGroup> = new Set(["transform", "opacity", "audio"]);

function Popover({ menu }: { menu: PasteAttributesMenu }) {
  const ref = useRef<HTMLDivElement>(null);
  const [checked, setChecked] = useState<ReadonlySet<AttributeGroup>>(() => {
    const unchecked = uncheckedGroups.getState();
    return new Set(menu.groups.filter((group) => !unchecked.has(group)));
  });

  // Inside the viewport (one measurement when it opens).
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    element.style.left = `${Math.max(0, Math.min(menu.x, window.innerWidth - width))}px`;
    element.style.top = `${Math.max(0, Math.min(menu.y, window.innerHeight - height))}px`;
  }, [menu.x, menu.y]);

  useDismiss([ref], closePasteAttributes);

  const toggle = (group: AttributeGroup) =>
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  const apply = useCallback(() => applyPasteAttributes(checked), [checked]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not([aria-disabled])") ?? [])];
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const down = event.key === "ArrowDown";
      const count = buttons.length;
      buttons[at < 0 ? (down ? 0 : count - 1) : (at + (down ? 1 : count - 1)) % count]?.focus();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    // Closing hands the keyboard back to the panel: the key dispatcher (on window) must not see this
    // Enter there too, or a lone selected title would start inline editing.
    event.stopPropagation();
    apply();
  };
  const animated = menu.groups.some((group) => ANIMATED.has(group) && checked.has(group));
  const nothing = ![...checked].some((group) => group !== "keyframes");
  const targets = menu.ids.length;

  return createPortal(
    <div ref={ref} className={styles.popover} role="dialog" aria-label="Paste attributes" data-scope="dialog" onKeyDown={onKeyDown}>
      <div className={styles.heading}>Paste attributes</div>
      <div className={styles.meta}>{targets === 1 ? "Onto 1 clip" : `Onto ${targets} clips`}</div>
      <div className={styles.list} role="group" aria-label="Attributes">
        {menu.groups.map((group) => {
          const on = checked.has(group);
          const dim = group === "keyframes" && !animated;
          return (
            <button
              key={group}
              type="button"
              role="checkbox"
              aria-checked={on}
              aria-disabled={dim || undefined}
              className={cx(styles.row, group === "keyframes" && styles.separated)}
              onClick={dim ? undefined : () => toggle(group)}
            >
              <span className={cx(styles.box, on && styles.on)} aria-hidden="true">
                {on && <Check className={styles.check} />}
              </span>
              <span className={styles.label}>{ATTRIBUTE_LABELS[group]}</span>
            </button>
          );
        })}
      </div>
      <div className={styles.footer}>
        <Button control size="compact" onClick={closePasteAttributes}>
          Cancel
        </Button>
        <Button control size="compact" variant="primary" disabled={nothing} autoFocus onClick={apply}>
          Paste
        </Button>
      </div>
    </div>,
    document.body,
  );
}

/** Rendered by the app; shows the popover only while it is open. */
export function PasteAttributesPopover() {
  const menu = useStoreSelector(pasteAttributesMenu, (state) => state);
  return menu ? <Popover key={`${menu.x},${menu.y},${menu.ids.join(",")}`} menu={menu} /> : null;
}
