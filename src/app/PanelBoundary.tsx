import { RotateCcw, TriangleAlert } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import type { PanelId } from "../core/store/layoutStore.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { Button } from "../ui/Button.js";
import { EmptyState } from "../ui/EmptyState.js";
import styles from "./PanelFrame.module.css";
import { PanelTitle } from "./PanelFrame.js";
import { panelEpochs, panelFaults, reportPanelFault } from "./panelErrors.js";

interface CatcherProps {
  id: PanelId;
  children: ReactNode;
}

/** Catches what the panel's React tree throws (render, effects) and reports it as the panel's fault. */
class Catcher extends Component<CatcherProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`[app] the ${this.props.id} panel failed`, error, info.componentStack ?? "");
    reportPanelFault(this.props.id, error);
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/** A failed panel in its grid cell: its title, what went wrong and Reload panel. */
function PanelFallback({ id, title, message }: { id: PanelId; title: string; message: string }) {
  return (
    <section className={styles.panel} data-panel={id} data-scope={id} data-panel-error="">
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <PanelTitle>{title}</PanelTitle>
        </div>
      </header>
      <div className={styles.body}>
        <EmptyState icon={TriangleAlert} tone="danger" title={`${title} stopped working`} text={message}>
          <Button commandId="panel.reload" icon={RotateCcw} tooltip="Build the panel again. Your project and its edits are kept.">
            Reload panel
          </Button>
        </EmptyState>
      </div>
    </section>
  );
}

/**
 * One panel of the workspace behind an error boundary (Batch 47): if it fails (a React error, or its
 * canvas view failing frame after frame), the panel shows what went wrong and Reload panel in its
 * place, and the rest of the editor keeps working.
 */
export function PanelBoundary({ id, title, children }: { id: PanelId; title: string; children: ReactNode }) {
  const fault = useStoreSelector(panelFaults, (faults) => faults[id] ?? null);
  const epoch = useStoreSelector(panelEpochs, (epochs) => epochs[id] ?? 0);
  if (fault !== null) return <PanelFallback id={id} title={title} message={fault} />;
  return (
    <Catcher key={epoch} id={id}>
      {children}
    </Catcher>
  );
}
