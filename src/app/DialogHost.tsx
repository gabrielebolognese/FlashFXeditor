import { FolderPlus, History, KeyRound, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import type { FsDir } from "../project/fs.js";
import { CUSTOM_RESOLUTION, DEFAULT_NEW_PROJECT, FRAME_RATES, RESOLUTION_PRESETS, formatFps, fpsKey, parseFpsKey } from "../project/projectPresets.js";
import type { Recovery } from "../project/recovery.js";
import { Button } from "../ui/Button.js";
import { Modal } from "../ui/Modal.js";
import { NumberField } from "../ui/NumberField.js";
import { Select } from "../ui/Select.js";
import { TextField } from "../ui/TextField.js";
import { MAX_DIMENSION, MAX_PROJECT_NAME, MIN_DIMENSION } from "../core/commands/projectCommands.js";
import styles from "./DialogHost.module.css";
import { appView, closeDialog, confirmNewProject, keepSavedVersion, restoreRecovery, retryOpen, type Dialog } from "./projectController.js";

const selectDialog = (view: { dialog: Dialog | null }) => view.dialog;
const selectBusy = (view: { busy: boolean }) => view.busy;

const RESOLUTION_OPTIONS = [...RESOLUTION_PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: CUSTOM_RESOLUTION, label: "Custom" }];
const FPS_OPTIONS = FRAME_RATES.map((fps) => ({ value: fpsKey(fps), label: `${formatFps(fps)} fps` }));

function NewProjectDialog({ dir }: { dir: FsDir }) {
  const busy = useStoreSelector(appView, selectBusy);
  const [name, setName] = useState(dir.name);
  const [preset, setPreset] = useState<string>(RESOLUTION_PRESETS[0]?.id ?? CUSTOM_RESOLUTION);
  const [size, setSize] = useState({ width: DEFAULT_NEW_PROJECT.width, height: DEFAULT_NEW_PROJECT.height });
  const [fps, setFps] = useState(fpsKey(DEFAULT_NEW_PROJECT.fps));

  const choosePreset = (id: string) => {
    setPreset(id);
    const match = RESOLUTION_PRESETS.find((p) => p.id === id);
    if (match) setSize({ width: match.width, height: match.height });
  };
  const create = () => {
    if (busy) return;
    void confirmNewProject(dir, name, { ...size, fps: parseFpsKey(fps) ?? DEFAULT_NEW_PROJECT.fps });
  };

  return (
    <Modal
      title="New project"
      icon={FolderPlus}
      onClose={closeDialog}
      footer={
        <>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={create}>
            Create project
          </Button>
        </>
      }
    >
      <p className={styles.text}>
        The project is created in the folder <span className={styles.folder}>{dir.name}</span>.
      </p>
      <div className={styles.form}>
        <span className={styles.label}>Name</span>
        <TextField value={name} onChange={setName} onCommit={create} ariaLabel="Project name" maxLength={MAX_PROJECT_NAME} autoFocus />
        <span className={styles.label}>Resolution</span>
        <Select value={preset} options={RESOLUTION_OPTIONS} onChange={choosePreset} label="Resolution" />
        {preset === CUSTOM_RESOLUTION && (
          <>
            <span className={styles.label}>Size</span>
            <div className={styles.pair}>
              <NumberField label="W" unit="px" value={size.width} min={MIN_DIMENSION} max={MAX_DIMENSION} onChange={(width) => setSize((s) => ({ ...s, width }))} ariaLabel="Width" />
              <NumberField label="H" unit="px" value={size.height} min={MIN_DIMENSION} max={MAX_DIMENSION} onChange={(height) => setSize((s) => ({ ...s, height }))} ariaLabel="Height" />
            </div>
          </>
        )}
        <span className={styles.label}>Frame rate</span>
        <Select value={fps} options={FPS_OPTIONS} onChange={setFps} label="Frame rate" />
      </div>
    </Modal>
  );
}

function RecoveryDialog({ recovery }: { recovery: Recovery }) {
  const when = (ms: number | null) => (ms === null ? "never" : new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" }));
  return (
    <Modal
      title="Restore unsaved changes?"
      icon={History}
      onClose={closeDialog}
      footer={
        <>
          <Button onClick={keepSavedVersion}>Keep saved version</Button>
          <Button variant="primary" onClick={() => restoreRecovery(recovery)}>
            Restore changes
          </Button>
        </>
      }
    >
      <p className={styles.text}>
        The last save of this project was interrupted. A newer copy of <span className={styles.folder}>{recovery.project.name}</span> was found in{" "}
        <span className={styles.mono}>project.json.tmp</span>.
      </p>
      <dl className={styles.facts}>
        <dt>Unsaved copy</dt>
        <dd>{when(recovery.modified)}</dd>
        <dt>Saved project</dt>
        <dd>{when(recovery.savedModified)}</dd>
      </dl>
      <p className={styles.note}>Restoring keeps the current project.json in history/.</p>
    </Modal>
  );
}

function PermissionDialog({ dir, message }: { dir: FsDir; message: string }) {
  return (
    <Modal
      title="Permission needed"
      icon={KeyRound}
      size="sm"
      onClose={closeDialog}
      footer={
        <>
          <Button onClick={closeDialog}>Cancel</Button>
          <Button variant="primary" onClick={() => void retryOpen(dir)}>
            Try again
          </Button>
        </>
      }
    >
      <p className={styles.text}>{message}</p>
      <p className={styles.note}>Allow access when the browser asks. Without write access the project opens read-only.</p>
    </Modal>
  );
}

function ErrorDialog({ title, message, issues }: { title: string; message: string; issues: readonly string[] }) {
  return (
    <Modal
      title={title}
      icon={TriangleAlert}
      onClose={closeDialog}
      footer={
        <Button variant="primary" onClick={closeDialog}>
          OK
        </Button>
      }
    >
      <p className={styles.text}>{message}</p>
      {issues.length > 0 && (
        <ul className={styles.issues}>
          {issues.map((issue, i) => (
            <li key={i}>{issue}</li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** The one dialog of the project flows, over the start screen or the editor. */
export function DialogHost() {
  const dialog = useStoreSelector(appView, selectDialog);
  if (!dialog) return null;
  switch (dialog.kind) {
    case "newProject":
      return <NewProjectDialog dir={dialog.dir} />;
    case "recovery":
      return <RecoveryDialog recovery={dialog.recovery} />;
    case "permission":
      return <PermissionDialog dir={dialog.dir} message={dialog.message} />;
    case "error":
      return <ErrorDialog title={dialog.title} message={dialog.message} issues={dialog.issues} />;
  }
}
