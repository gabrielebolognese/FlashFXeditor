import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  text?: ReactNode;
  /** The one-click actions that fix the state (Buttons). */
  children?: ReactNode;
  /**
   * `fill`: centered in its container (an empty panel); `inline`: from the top, over content that
   * stays (a search or a filter with no result above an empty list).
   */
  layout?: "fill" | "inline";
  /** Pointer events go through the block to what lies under it (the timeline canvas), its actions aside. */
  passThrough?: boolean;
  /** `danger`: something failed (a panel's error state, Batch 47): the icon in the danger color. */
  tone?: "danger";
}

/**
 * The one empty state look (Batch 46): a muted icon, title type, a caption hint, then the actions that
 * fix it (spec §0: every state has a one-click way forward).
 */
export function EmptyState({ icon: Icon, title, text, children, layout = "fill", passThrough, tone }: EmptyStateProps) {
  return (
    <div className={styles.empty} data-layout={layout} data-pass-through={passThrough ? "" : undefined} data-tone={tone}>
      <Icon className={styles.icon} aria-hidden="true" />
      <p className={styles.title}>{title}</p>
      {text !== undefined && <p className={styles.text}>{text}</p>}
      {children !== undefined && <div className={styles.actions}>{children}</div>}
    </div>
  );
}
