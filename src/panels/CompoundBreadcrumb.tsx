import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { closeCompound, crumbs } from "../app/compoundController.js";
import { documentStore, sessionStore } from "../app/services.js";
import type { SequenceId } from "../core/document/types.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import type { SessionState } from "../core/store/sessionStore.js";
import { IconButton } from "../ui/IconButton.js";
import styles from "./CompoundBreadcrumb.module.css";

const selectPath = (state: SessionState): readonly SequenceId[] => state.scope.path;

/**
 * The timeline's breadcrumb while a compound is open (spec §21.10, Batch 63): `Project > Card 3`.
 * Each level but the last goes back to it; Esc closes one level. Renders only when the open path
 * changes (never during playback, P1); the names are read once per render.
 */
export function CompoundBreadcrumb() {
  const path = useStoreSelector(sessionStore.state, selectPath);
  if (path.length === 0) return null;
  const names = crumbs(documentStore.getRoot(), path);
  return (
    <nav className={styles.bar} aria-label="Open compounds">
      {names.map((name, depth) => (
        <Fragment key={depth}>
          {depth > 0 && <ChevronRight className={styles.separator} aria-hidden="true" />}
          {depth === names.length - 1 ? (
            <span className={styles.current} aria-current="location">
              {name}
            </span>
          ) : (
            <IconButton control text={name} label={`Back to ${name}`} onClick={() => closeCompound(sessionStore, depth)} />
          )}
        </Fragment>
      ))}
    </nav>
  );
}
