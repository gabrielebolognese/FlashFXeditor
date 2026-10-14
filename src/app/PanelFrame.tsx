import { useRef, type ReactNode } from "react";
import type { PanelId } from "../core/store/layoutStore.js";
import styles from "./PanelFrame.module.css";
import { usePanelSize } from "./useWorkspaceLayout.js";

export interface PanelFrameProps {
  id: PanelId;
  /** Left side of the header strip: a title or tabs. */
  header: ReactNode;
  /** Right side of the header strip: panel one-click actions. */
  actions?: ReactNode;
  /** A strip under the body (the preview chrome); the body size excludes it. */
  footer?: ReactNode;
  children: ReactNode;
}

/** A panel: header strip + body (+ footer strip). The body size is reported to the layout store. */
export function PanelFrame({ id, header, actions, footer, children }: PanelFrameProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  usePanelSize(id, bodyRef);
  return (
    <section className={styles.panel} data-panel={id} data-scope={id}>
      <header className={styles.header}>
        <div className={styles.headerMain}>{header}</div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      <div ref={bodyRef} className={styles.body}>
        {children}
      </div>
      {footer && <footer className={styles.footer}>{footer}</footer>}
    </section>
  );
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return <h2 className={styles.title}>{children}</h2>;
}

export interface PanelTabsProps<T extends string> {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}

export function PanelTabs<T extends string>({ tabs, active, onChange }: PanelTabsProps<T>) {
  return (
    <div className={styles.tabs} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className={styles.tab}
          aria-selected={tab.id === active}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
