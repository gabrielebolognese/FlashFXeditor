import { useEffect, useRef } from "react";
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
import { Splitter } from "./Splitter.js";
import { StartScreen } from "./StartScreen.js";
import { ToastHost } from "./ToastHost.js";
import { useWorkspaceLayout } from "./useWorkspaceLayout.js";

const selectProjectId = (view: AppView) => view.project?.id ?? null;

/** Marks `name` on the performance timeline at the first idle moment after the first commit (startup times, spec P12). */
function useInteractiveMark(name: string): void {
  useEffect(() => {
    const handle = requestIdleCallback(() => performance.mark(name));
    return () => cancelIdleCallback(handle);
  }, [name]);
}

/** The fixed four-panel layout of spec §2. */
function Editor() {
  const workspaceRef = useRef<HTMLDivElement>(null);
  useWorkspaceLayout(workspaceRef);
  useInteractiveMark("editor:interactive");

  return (
    <div className={styles.app}>
      <AppBar />
      <main ref={workspaceRef} className={styles.workspace} data-layout-ratio="left">
        <div className={styles.leftGroup} data-layout-ratio="top">
          <div className={styles.topRow} data-layout-ratio="media">
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
 * the command palette, the cheat sheet and the settings (Batch 40). The project dialogs come after the
 * settings: one opened from them (Clear cache, Batch 42) shows above them.
 */
export function App() {
  const projectId = useStoreSelector(appView, selectProjectId);
  useInteractiveMark("app:interactive");
  return (
    <>
      {projectId === null ? <StartScreen /> : <Editor key={projectId} />}
      <SettingsDialog />
      <ShortcutSheet />
      <DialogHost />
      <CommandPalette />
      <ToastHost />
    </>
  );
}
