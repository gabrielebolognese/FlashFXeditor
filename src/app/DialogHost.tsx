import { Check, FolderPlus, History, KeyRound, Trash2, TriangleAlert } from "lucide-react";
import { useCallback, useState } from "react";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import type { FsDir } from "../project/fs.js";
import { CUSTOM_RESOLUTION, DEFAULT_NEW_PROJECT, FRAME_RATES, RESOLUTION_PRESETS, formatFps, fpsKey, parseFpsKey, resolutionPresetId } from "../project/projectPresets.js";
import { describeTemplate, type ProjectTemplate } from "../project/templates.js";
import type { Recovery } from "../project/recovery.js";
import { Button } from "../ui/Button.js";
import { Modal } from "../ui/Modal.js";
import { NumberField, useValueBinding } from "../ui/NumberField.js";
import { Select } from "../ui/Select.js";
import { TextField } from "../ui/TextField.js";
import { MAX_DIMENSION, MAX_PROJECT_NAME, MIN_DIMENSION } from "../core/commands/projectCommands.js";
import type { MediaId } from "../core/document/types.js";
import { documentStore, templateStore } from "./services.js";
import { ClearCacheDialog, DiscardChangesDialog, FrameRateDialog, HistoryDialog, ResolutionDialog, SaveTemplateDialog } from "./ProjectDialogs.js";
import { TranscribeDialogs } from "../panels/media/TranscribeDialog.js";
import styles from "./DialogHost.module.css";
import { cancelRemove, clipsUsing, confirmRemove, copiedCount, mediaPanel, type MediaPanelState } from "./mediaController.js";
import { appView, closeDialog, confirmNewProject, keepSavedVersion, restoreRecovery, retryOpen, type Dialog } from "./projectController.js";

const selectDialog = (view: { dialog: Dialog | null }) => view.dialog;
const selectBusy = (view: { busy: boolean }) => view.busy;
const selectRemoving = (state: MediaPanelState) => state.removing;

const RESOLUTION_OPTIONS = [...RESOLUTION_PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: CUSTOM_RESOLUTION, label: "Custom" }];
const FPS_OPTIONS = FRAME_RATES.map((fps) => ({ value: fpsKey(fps), label: `${formatFps(fps)} fps` }));

const NO_TEMPLATE = "none";

/** The form's settings for a template (or the defaults). */
function startingSettings(template: ProjectTemplate | null): { preset: string; size: { width: number; height: number }; fps: string } {
  const source = template?.settings ?? DEFAULT_NEW_PROJECT;
  return { preset: resolutionPresetId(source.width, source.height), size: { width: source.width, height: source.height }, fps: fpsKey(source.fps) };
}

function fpsChoices(current: string) {
  const parsed = parseFpsKey(current);
  return parsed && !FPS_OPTIONS.some((option) => option.value === current) ? [...FPS_OPTIONS, { value: current, label: `${formatFps(parsed)} fps` }] : FPS_OPTIONS;
}

function NewProjectDialog({ dir, initialTemplate }: { dir: FsDir; initialTemplate: string | null }) {
  const busy = useStoreSelector(appView, selectBusy);
  const templates = useStoreSelector(templateStore.list, (list) => list);
  const [templateId, setTemplateId] = useState(initialTemplate ?? NO_TEMPLATE);
  const template = templates.find((candidate) => candidate.id === templateId) ?? null;
  const start = startingSettings(template);
  const [name, setName] = useState(dir.name);
  const [preset, setPreset] = useState<string>(start.preset);
  const [size, setSize] = useState(start.size);
  const [fps, setFps] = useState(start.fps);
  const widthBinding = useValueBinding(size.width, useCallback((width: number) => setSize((s) => ({ ...s, width })), []));
  const heightBinding = useValueBinding(size.height, useCallback((height: number) => setSize((s) => ({ ...s, height })), []));

  const choosePreset = (id: string) => {
    setPreset(id);
    const match = RESOLUTION_PRESETS.find((p) => p.id === id);
    if (match) setSize({ width: match.width, height: match.height });
  };
  const chooseTemplate = (id: string) => {
    setTemplateId(id);
    const next = startingSettings(templates.find((candidate) => candidate.id === id) ?? null);
    setPreset(next.preset);
    setSize(next.size);
    setFps(next.fps);
  };
  const create = () => {
    if (busy) return;
    void confirmNewProject(dir, name, { ...size, fps: parseFpsKey(fps) ?? DEFAULT_NEW_PROJECT.fps }, template?.id ?? null);
  };
  const templateOptions = [{ value: NO_TEMPLATE, label: "None: V1 and A1" }, ...templates.map((candidate) => ({ value: candidate.id, label: candidate.name }))];

  return (
    <Modal
      title="New project"
      icon={FolderPlus}
      onClose={closeDialog}
      footer={
        <>
          <Button control onClick={closeDialog}>Cancel</Button>
          <Button control variant="primary" disabled={busy} onClick={create}>
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
        {templates.length > 0 && (
          <>
            <span className={styles.label}>Template</span>
            <Select value={templateId} options={templateOptions} onChange={chooseTemplate} label="Template" />
          </>
        )}
        <span className={styles.label}>Resolution</span>
        <Select value={preset} options={RESOLUTION_OPTIONS} onChange={choosePreset} label="Resolution" />
        {preset === CUSTOM_RESOLUTION && (
          <>
            <span className={styles.label}>Size</span>
            <div className={styles.pair}>
              <NumberField label="W" unit="px" binding={widthBinding} min={MIN_DIMENSION} max={MAX_DIMENSION} step={2} ariaLabel="Width" />
              <NumberField label="H" unit="px" binding={heightBinding} min={MIN_DIMENSION} max={MAX_DIMENSION} step={2} ariaLabel="Height" />
            </div>
          </>
        )}
        <span className={styles.label}>Frame rate</span>
        <Select value={fps} options={fpsChoices(fps)} onChange={setFps} label="Frame rate" />
      </div>
      {template && <p className={styles.note}>{`From ${template.name}: ${describeTemplate(template, formatFps)}. Its tracks, caption style, background and presets come with it.`}</p>}
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
          <Button control onClick={keepSavedVersion}>Keep saved version</Button>
          <Button control variant="primary" onClick={() => restoreRecovery(recovery)}>
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
          <Button control onClick={closeDialog}>Cancel</Button>
          <Button control variant="primary" onClick={() => void retryOpen(dir)}>
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
        <Button control variant="primary" onClick={closeDialog}>
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

/**
 * Delete in the media panel (spec §12): "Remove from project" (used media leave their clips offline,
 * a gray slate) or "Remove and delete clips", and a checkbox that deletes the copied files from media/.
 */
function RemoveMediaDialog({ ids }: { ids: readonly MediaId[] }) {
  const media = documentStore.getState().media;
  const names = ids.map((id) => media[id]?.name ?? id);
  const used = clipsUsing(ids);
  const copied = copiedCount(ids);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const subject = ids.length === 1 ? (names[0] ?? "") : `${ids.length} media files`;
  const clips = `${used} clip${used === 1 ? "" : "s"}`;
  return (
    <Modal
      title="Remove media"
      icon={Trash2}
      size="md"
      onClose={cancelRemove}
      footer={
        <>
          <Button control disabled={used === 0} tooltip={used === 0 ? "No clip uses this media" : `Also deletes the ${clips} that use it`} onClick={() => confirmRemove("delete", deleteFiles)}>
            Remove and delete clips
          </Button>
          <Button control variant="primary" autoFocus onClick={() => confirmRemove("keep", deleteFiles)}>
            Remove from project
          </Button>
        </>
      }
    >
      <p className={styles.text}>
        Remove <span className={styles.folder}>{subject}</span> from the project?
      </p>
      <p className={styles.note}>
        {used > 0 ? `Used by ${clips}. Remove from project keeps them on the timeline as offline clips (a gray slate); Remove and delete clips takes them out too. Undo brings everything back.` : "No clip uses it. Undo brings the media back."}
      </p>
      {copied > 0 && (
        <button type="button" role="checkbox" aria-checked={deleteFiles} className={styles.check} onClick={() => setDeleteFiles((on) => !on)}>
          <span className={styles.box} data-on={deleteFiles || undefined} aria-hidden="true">
            {deleteFiles && <Check className={styles.checkIcon} />}
          </span>
          <span>
            Also delete {copied === 1 ? "its copied file" : `the ${copied} copied files`} from the media folder
            <span className={styles.checkNote}>Can't be undone: the media would come back offline.</span>
          </span>
        </button>
      )}
    </Modal>
  );
}

/** The one dialog of the project flows, over the start screen or the editor (then media removal, then transcription). */
export function DialogHost() {
  const dialog = useStoreSelector(appView, selectDialog);
  const removing = useStoreSelector(mediaPanel, selectRemoving);
  if (!dialog) return removing ? <RemoveMediaDialog ids={removing} /> : <TranscribeDialogs />;
  switch (dialog.kind) {
    case "newProject":
      return <NewProjectDialog dir={dialog.dir} initialTemplate={dialog.template} />;
    case "recovery":
      return <RecoveryDialog recovery={dialog.recovery} />;
    case "permission":
      return <PermissionDialog dir={dialog.dir} message={dialog.message} />;
    case "error":
      return <ErrorDialog title={dialog.title} message={dialog.message} issues={dialog.issues} />;
    case "resolution":
      return <ResolutionDialog width={dialog.width} height={dialog.height} />;
    case "frameRate":
      return <FrameRateDialog fps={dialog.fps} report={dialog.report} />;
    case "history":
      return <HistoryDialog />;
    case "saveTemplate":
      return <SaveTemplateDialog />;
    case "clearCache":
      return <ClearCacheDialog />;
    case "discardChanges":
      return <DiscardChangesDialog next={dialog.next} />;
  }
}
