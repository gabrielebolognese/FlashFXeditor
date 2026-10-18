import { RotateCcw, TriangleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "../ui/Button.js";
import { saveBeforeReload } from "./projectController.js";
import styles from "./UnsupportedScreen.module.css";

/** Saves what can be saved, then loads the app again. */
function reload(): void {
  void saveBeforeReload()
    .catch((error: unknown) => console.error("[app] could not save before reloading", error))
    .finally(() => window.location.reload());
}

/**
 * The editor could not start, or its shell failed outside every panel (Batch 47): a full-screen message
 * with Reload instead of a blank page. The project's saved state stays in its folder.
 */
export function FatalScreen({ message }: { message: string }) {
  return (
    <div className={styles.screen}>
      <div className={styles.card} role="alert">
        <div className={styles.header}>
          <TriangleAlert className={styles.icon} aria-hidden="true" />
          <h1 className={styles.title}>Shorts Editor stopped working</h1>
        </div>
        <p className={styles.text}>Reload to carry on. Your project is saved in its folder; edits from the last second may be missing.</p>
        <p className={styles.detail}>{message}</p>
        <div className={styles.actions}>
          <Button control variant="primary" icon={RotateCcw} onClick={reload}>
            Reload
          </Button>
        </div>
      </div>
    </div>
  );
}

/** The last line of defense around the whole app: what no panel boundary caught. */
export class AppBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  override state: { message: string | null } = { message: null };

  static getDerivedStateFromError(error: unknown): { message: string } {
    return { message: error instanceof Error ? error.message || error.name : String(error) };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("[app] the editor failed", error, info.componentStack ?? "");
  }

  override render(): ReactNode {
    return this.state.message === null ? this.props.children : <FatalScreen message={this.state.message} />;
  }
}
