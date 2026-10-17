import { X, type LucideIcon } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { IconButton } from "./IconButton.js";
import styles from "./Modal.module.css";

export interface ModalProps {
  title: string;
  icon?: LucideIcon | undefined;
  size?: "sm" | "md" | "lg" | "xl" | undefined;
  /** Escape, the scrim and the close button. */
  onClose: () => void;
  children: ReactNode;
  /** Action bar (right-aligned buttons). */
  footer?: ReactNode;
}

/**
 * Centered modal (design system: surface-2 panel, radius-xl, modal shadow, black/60 + blur scrim).
 * Owns the keyboard through the `dialog` focus scope; focus moves in on open and back on close.
 */
export function Modal({ title, icon: Icon, size = "md", onClose, children, footer }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Read at first render: by the time effects run, autoFocus children have already taken focus.
  const [previous] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));

  useLayoutEffect(() => {
    const panel = panelRef.current;
    // Children with autoFocus are already focused here; otherwise focus the first control.
    if (panel && !panel.contains(document.activeElement)) {
      (panel.querySelector<HTMLElement>("input, select, [data-variant='primary'], [data-variant='hero']") ?? panel).focus();
    }
    return () => {
      if (previous?.isConnected && !panel?.contains(previous)) previous.focus();
    };
  }, [previous]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    onClose();
  };

  return (
    <div
      className={styles.scrim}
      data-scope="dialog"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} className={styles.panel} data-size={size} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <header className={styles.header}>
          {Icon && <Icon className={styles.icon} aria-hidden="true" />}
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <IconButton control icon={X} label="Close" onClick={onClose} />
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>
  );
}
