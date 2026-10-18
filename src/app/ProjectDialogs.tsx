import { Eraser, History, LayoutTemplate, Proportions, RotateCcw, Timer, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { ConversionReport } from "../core/document/fpsConvert.js";
import type { Project, Rational } from "../core/document/types.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { formatBytes } from "../project/cache.js";
import { formatFps } from "../project/projectPresets.js";
import { cleanTemplateName, MAX_TEMPLATE_NAME } from "../project/templates.js";
import { Button } from "../ui/Button.js";
import { Modal } from "../ui/Modal.js";
import { TextField } from "../ui/TextField.js";
import { cacheInfo, clearProjectCache } from "./cacheController.js";
import { applyFrameRate, confirmResolution, describeRounding } from "./conversionController.js";
import styles from "./DialogHost.module.css";
import { backupLabel, historyList, restoreBackup } from "./historyController.js";
import { closeDialog, continueDiscarding, currentSession } from "./projectController.js";
import own from "./ProjectDialogs.module.css";
import { documentStore, saveStatus } from "./services.js";
import { saveAsTemplate } from "./templateController.js";

// The project dialogs of Batch 42 (spec §15): Scale layout or Keep for a new frame size, the warning
// before a frame rate conversion that rounds timings, the History list with its restore confirmation,
// Save as template's name, Clear cache, and the read-only discard question before another project opens.

const selectName = (project: Project) => project.name;

export function ResolutionDialog({ width, height }: { width: number; height: number }) {
  const from = documentStore.getState().settings;
  return (
    <Modal
      title="Change the frame size"
      icon={Proportions}
      onClose={closeDialog}
      footer={
        <>
          <Button control onClick={closeDialog}>
            Cancel
          </Button>
          <Button control tooltip="Every layer keeps its size in pixels and its place from the center" onClick={() => confirmResolution(width, height, false)}>
            Keep
          </Button>
          <Button control variant="primary" autoFocus tooltip="Positions and sizes follow the new frame" onClick={() => confirmResolution(width, height, true)}>
            Scale layout
          </Button>
        </>
      }
    >
      <p className={styles.text}>
        From <span className={styles.mono}>{`${from.width}×${from.height}`}</span> to <span className={styles.mono}>{`${width}×${height}`}</span>.
      </p>
      <p className={styles.note}>
        Scale layout moves and scales every layer (keyframes too) so it sits in the new frame as it sat in the old one. Keep leaves each layer at its size in pixels and its offset from the center. Undo reverts either.
      </p>
    </Modal>
  );
}

export function FrameRateDialog({ fps, report }: { fps: Rational; report: ConversionReport }) {
  const from = documentStore.getState().settings.fps;
  return (
    <Modal
      title={`Convert to ${formatFps(fps)} fps?`}
      icon={Timer}
      onClose={closeDialog}
      footer={
        <>
          <Button control onClick={closeDialog}>
            Cancel
          </Button>
          <Button control variant="primary" autoFocus onClick={() => applyFrameRate(fps)}>
            Convert
          </Button>
        </>
      }
    >
      <p className={styles.text}>
        Every clip, fade, transition, keyframe, caption and marker moves from {formatFps(from)} fps to {formatFps(fps)} fps, keeping its time.
      </p>
      <p className={own.warning}>
        <TriangleAlert className={own.warningIcon} aria-hidden="true" />
        <span>{describeRounding(report)}.</span>
      </p>
      <p className={styles.note}>Undo reverts the whole conversion.</p>
    </Modal>
  );
}

function sizeText(size: number | null): string {
  return size === null ? "" : formatBytes(size);
}

export function HistoryDialog() {
  const state = useStoreSelector(historyList, (s) => s);
  const name = useStoreSelector(documentStore, selectName);
  const readOnly = useStoreSelector(saveStatus, (status) => status.readOnly);
  const [confirming, setConfirming] = useState<string | null>(null);
  const backups = state.backups;
  const chosen = confirming ? backups?.find((backup) => backup.name === confirming) : undefined;

  if (chosen) {
    return (
      <Modal
        title="Restore this version?"
        icon={RotateCcw}
        onClose={() => setConfirming(null)}
        footer={
          <>
            <Button control onClick={() => setConfirming(null)}>
              Back
            </Button>
            <Button control variant="primary" autoFocus disabled={state.restoring !== null} onClick={() => void restoreBackup(chosen.name)}>
              {state.restoring ? "Restoring…" : "Restore"}
            </Button>
          </>
        }
      >
        <p className={styles.text}>
          <span className={styles.folder}>{name}</span> goes back to the version saved on <span className={styles.folder}>{backupLabel(chosen.time)}</span>.
        </p>
        <p className={styles.note}>The current version is saved first and stays in History, so you can come back to it. Undo history starts over.</p>
      </Modal>
    );
  }

  return (
    <Modal
      title="History"
      icon={History}
      size="md"
      onClose={closeDialog}
      footer={
        <Button control variant="primary" onClick={closeDialog}>
          Done
        </Button>
      }
    >
      <p className={styles.note}>Every save keeps the version before it, the last 20 of them, in the project's history folder.</p>
      {state.error && <p className={own.warning}>Couldn't read the history folder: {state.error}</p>}
      {!backups && <p className={styles.note}>Reading the history folder…</p>}
      {backups && backups.length === 0 && <p className={styles.text}>No earlier versions yet: they appear after the first saves.</p>}
      {backups && backups.length > 0 && (
        <ol className={own.list} data-control="">
          {backups.map((backup, index) => (
            <li key={backup.name} className={own.row}>
              <span className={own.when}>
                <span className={own.time}>{backupLabel(backup.time)}</span>
                <span className={own.meta}>{[backup.projectName, sizeText(backup.size), index === 0 ? "latest backup" : ""].filter(Boolean).join(" · ")}</span>
              </span>
              <Button
                control
                size="compact"
                icon={RotateCcw}
                disabled={readOnly || state.restoring !== null}
                tooltip={readOnly ? "Read-only project: allow editing to restore" : "Make this version the current one"}
                onClick={() => setConfirming(backup.name)}
              >
                Restore…
              </Button>
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

export function SaveTemplateDialog() {
  const project = useStoreSelector(documentStore, selectName);
  const [name, setName] = useState(project);
  const clean = cleanTemplateName(name);
  const save = () => {
    if (clean) void saveAsTemplate(clean);
  };
  return (
    <Modal
      title="Save as template"
      icon={LayoutTemplate}
      onClose={closeDialog}
      footer={
        <>
          <Button control onClick={closeDialog}>
            Cancel
          </Button>
          <Button control variant="primary" disabled={!clean} tooltip={clean ? undefined : "Type a name for the template first"} onClick={save}>
            Save template
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <span className={styles.label}>Name</span>
        <TextField value={name} onChange={setName} onCommit={save} ariaLabel="Template name" maxLength={MAX_TEMPLATE_NAME} autoFocus />
      </div>
      <p className={styles.note}>
        The template keeps the frame size, frame rate, background, the tracks (with the caption style) and this project's text presets. No media and no clips. New from template on the start screen starts a project with it; a template of the same name is replaced.
      </p>
    </Modal>
  );
}

export function ClearCacheDialog() {
  const info = useStoreSelector(cacheInfo, (state) => state);
  const name = useStoreSelector(documentStore, selectName);
  const size = info.size ? (info.size.files === 0 ? "The cache is empty." : `${formatBytes(info.size.bytes)} in ${info.size.files} file${info.size.files === 1 ? "" : "s"}.`) : "Measuring…";
  return (
    <Modal
      title="Clear the cache?"
      icon={Eraser}
      onClose={closeDialog}
      footer={
        <>
          <Button control onClick={closeDialog}>
            Cancel
          </Button>
          <Button control variant="primary" autoFocus onClick={() => void clearProjectCache()}>
            Clear cache
          </Button>
        </>
      }
    >
      <p className={styles.text}>
        Deletes the proxies, thumbnails, waveforms and indexes of <span className={styles.folder}>{name}</span>. {size}
      </p>
      <p className={styles.note}>Nothing of the project is lost: they are made again in the background, proxies of long videos take a while. Media files stay where they are.</p>
    </Modal>
  );
}

export function DiscardChangesDialog({ next }: { next: () => Promise<void> }) {
  const name = currentSession() ? documentStore.getState().name : "";
  return (
    <Modal
      title="Discard unsaved changes?"
      icon={TriangleAlert}
      onClose={closeDialog}
      footer={
        <>
          <Button control onClick={closeDialog}>
            Cancel
          </Button>
          <Button commandId="project.allowEditing" tooltip="Ask for write access, then save the changes">
            Allow editing
          </Button>
          <Button control variant="primary" onClick={() => void continueDiscarding(next)}>
            Discard and continue
          </Button>
        </>
      }
    >
      <p className={styles.text}>
        <span className={styles.folder}>{name}</span> is read-only: your changes to it were never saved and are lost when another project opens.
      </p>
      <p className={styles.note}>Allow editing saves them into the project folder first (the browser asks for write access).</p>
    </Modal>
  );
}
