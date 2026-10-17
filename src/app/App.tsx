import { useRef } from "react";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { CommandPalette } from "../panels/CommandPalette.js";
import { MediaPanel } from "../panels/MediaPanel.js";
import { PasteAttributesPopover } from "../panels/PasteAttributesPopover.js";
import { PreviewPanel } from "../panels/PreviewPanel.js";
import { PropertiesPanel } from "../panels/PropertiesPanel.js";
import { SettingsDialog } from "../panels/SettingsDialog.js";
import { ShortcutSheet } from "../panels/ShortcutSheet.js";
import { TimelinePanel } from "../panels/TimelinePanel.js";
import styles from "./App.module.css";
import { AppBar } from "./AppBar.js";
import { DialogHost } from "./DialogHost.js";
import { appView, type AppView } from "./projectController.js";
import { ReadOnlyBanner } from "./ReadOnlyBanner.js";
import { Splitter } from "./Splitter.js";
import { StartScreen } from "./StartScreen.js";
import { ToastHost } from "./ToastHost.js";
import { useWorkspaceLayout } from "./useWorkspaceLayout.js";

const selectProjectId = (view: AppView) => view.project?.id ?? null;

/** The fixed four-panel layout of spec §2. */
function Editor() {
  const workspaceRef = useRef<HTMLDivElement>(null);
  useWorkspaceLayout(workspaceRef);

  return (
    <div className={styles.app}>
      <AppBar />
      <ReadOnlyBanner />
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
      <PasteAttributesPopover />
    </div>
  );
}

/**
 * The start screen until a project is open (spec §15), then the editor. Dialogs float over both, as do
 * the command palette, the cheat sheet and the settings (Batch 40).
 */
export function App() {
  const projectId = useStoreSelector(appView, selectProjectId);
  return (
    <>
      {projectId === null ? <StartScreen /> : <Editor key={projectId} />}
      <DialogHost />
      <SettingsDialog />
      <ShortcutSheet />
      <CommandPalette />
      <ToastHost />
    </>
  );
}
