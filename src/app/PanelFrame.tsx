import { useRef, type ReactNode, type Ref } from "react";
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
  /** A column right of the body (the preview's audio meter); the body size excludes it. */
  aside?: ReactNode;
  /** The panel's section element (the preview writes its fullscreen attributes on it). */
  panelRef?: Ref<HTMLElement>;
  children: ReactNode;
}

/** A panel: header strip + body (+ aside column) (+ footer strip). The body size is reported to the layout store. */
export function PanelFrame({ id, header, actions, footer, aside, panelRef, children }: PanelFrameProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  usePanelSize(id, bodyRef);
  return (
    <section ref={panelRef} className={styles.panel} data-panel={id} data-scope={id}>
      <header className={styles.header}>
        <div className={styles.headerMain}>{header}</div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      {aside ? (
        <div className={styles.row}>
          <div ref={bodyRef} className={styles.body}>
            {children}
          </div>
          <aside className={styles.aside}>{aside}</aside>
        </div>
      ) : (
        <div ref={bodyRef} className={styles.body}>
          {children}
        </div>
      )}
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
  /** The command a tab's click runs (`onChange` runs it), so its tooltip shows the command's key. */
  commandOf?: (id: T) => string;
}

export function PanelTabs<T extends string>({ tabs, active, onChange, commandOf }: PanelTabsProps<T>) {
  return (
    <div className={styles.tabs} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className={styles.tab}
          aria-selected={tab.id === active}
          data-command={commandOf?.(tab.id)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
