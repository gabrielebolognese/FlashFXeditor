import { useRef } from "react";
import { MediaPanel } from "../panels/MediaPanel.js";
import { PreviewPanel } from "../panels/PreviewPanel.js";
import { PropertiesPanel } from "../panels/PropertiesPanel.js";
import { TimelinePanel } from "../panels/TimelinePanel.js";
import styles from "./App.module.css";
import { AppBar } from "./AppBar.js";
import { Splitter } from "./Splitter.js";
import { useWorkspaceLayout } from "./useWorkspaceLayout.js";

/** The fixed four-panel layout of spec §2. */
export function App() {
  const workspaceRef = useRef<HTMLDivElement>(null);
  useWorkspaceLayout(workspaceRef);

  return (
    <div className={styles.app}>
      <AppBar />
      <main ref={workspaceRef} className={styles.workspace}>
        <div className={styles.leftGroup}>
          <div className={styles.topRow}>
            <MediaPanel />
            <PropertiesPanel />
            <Splitter id="media" axis="x" />
          </div>
          <TimelinePanel />
          <Splitter id="top" axis="y" />
        </div>
        <PreviewPanel />
        <Splitter id="left" axis="x" />
      </main>
    </div>
  );
}
