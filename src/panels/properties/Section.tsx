import { ChevronDown } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { sessionStore } from "../../app/services.js";
import { setSectionCollapsed, type SessionState } from "../../core/store/sessionStore.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import type { SectionId } from "./context.js";
import styles from "./Section.module.css";

// A properties panel section (spec §11 "collapsible, state persisted"): a header button (chevron and
// overline title; Tab reaches it in visual order) and the label / control grid. The collapsed state is
// session state (`collapsedSections`, kept in session.json).
// TODO(batch 35): the stopwatch toggle and keyframe navigator of animatable sections in the header.

const keepFocus = (event: MouseEvent) => event.preventDefault();

export function Section({ id, title, children }: { id: SectionId; title: string; children: ReactNode }) {
  const collapsed = useStoreSelector(sessionStore.state, (state: SessionState) => state.collapsedSections[id] === true);
  const bodyId = `properties-section-${id}`;
  return (
    <section className={styles.section} data-section={id} aria-label={title}>
      <h3 className={styles.heading}>
        <button
          type="button"
          className={styles.header}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onMouseDown={keepFocus}
          onClick={() => setSectionCollapsed(sessionStore, id, !collapsed)}
        >
          <ChevronDown className={styles.chevron} aria-hidden="true" />
          {title}
        </button>
      </h3>
      {!collapsed && (
        <div id={bodyId} className={styles.grid}>
          {children}
        </div>
      )}
    </section>
  );
}

/** A grid row: the label on the left, the control(s) on the right. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className={styles.label}>{label}</span>
      {children}
    </>
  );
}
