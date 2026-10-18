import { FolderOpen, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { presetLibrary } from "../../app/presetController.js";
import { appView } from "../../app/projectController.js";
import { actions, appSettings } from "../../app/services.js";
import { checkDownloadedModels, downloadedModels, releaseTranscribeWorker, removeDownloadedModel } from "../../app/transcribeController.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { LANGUAGE_OPTIONS } from "../../media/transcribe/languages.js";
import { WHISPER_MODELS, type WhisperModelId } from "../../media/transcribe/models.js";
import { DUCK_DEPTH_MAX, DUCK_DEPTH_MIN, DUCK_RAMP_MAX, PUNCH_ZOOM_MAX, PUNCH_ZOOM_MIN } from "../../project/appSettings.js";
import { SILENCE_MIN_MS, SILENCE_PADDING_MS, SILENCE_THRESHOLD } from "../../timeline/edit/silence.js";
import { Button } from "../../ui/Button.js";
import { IconButton } from "../../ui/IconButton.js";
import { Select } from "../../ui/Select.js";
import { Row } from "../properties/Section.js";
import sectionStyles from "../properties/Section.module.css";
import { AutosaveRow, CacheRow, DurationRow, ProxyRows, SettingNumber, SwitchRow, TransitionRows } from "./SettingFields.js";
import styles from "./GeneralSettings.module.css";

// Settings > General (spec §17 app bar gear, §11 settings rows, §9.7 Clear cache; Batch 42): everything
// that applies to every project in this browser, in groups: saving, the lengths of new clips, the
// default transition, editing (keyframes follow source, punch zoom), audio (Auto-duck, Remove
// silence), transcription (model, language, downloaded models), media (how files are imported,
// proxies) and storage (the open project's cache, the preset library folder, the starter presets).
// The design system is dark only, so there is no theme choice.

function Group({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className={styles.group} aria-label={title}>
      <h3 className={styles.heading}>{title}</h3>
      <div className={sectionStyles.grid}>{children}</div>
      {note && <p className={styles.note}>{note}</p>}
    </section>
  );
}

const IMPORT_MODES = [
  {
    mode: "copy",
    command: "media.importMode.copy",
    label: "Copy files into the project folder",
    note: "The project stays self-contained in one folder you can move or back up.",
  },
  {
    mode: "reference",
    command: "media.importMode.reference",
    label: "Link to the original files",
    note: "Nothing is copied. Moved or renamed files go offline until you relink them, and after a restart the browser asks again before reading them.",
  },
] as const;

/** How imports bring files into the project (spec §9.1, Batch 41's Media tab). */
function ImportMode() {
  const mode = useStoreSelector(appSettings, (state) => state.importMode);
  return (
    <div className={styles.choices} role="radiogroup" aria-label="Import mode">
      {IMPORT_MODES.map((choice) => (
        <button key={choice.mode} type="button" role="radio" aria-checked={mode === choice.mode} className={styles.choice} data-command={choice.command} onClick={() => actions.run(choice.command)}>
          <span className={styles.radio} aria-hidden="true" />
          <span>
            <span className={styles.choiceLabel}>{choice.label}</span>
            <span className={styles.choiceNote}>{choice.note}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

const MODEL_OPTIONS = WHISPER_MODELS.map((model) => ({ value: model.id, label: `Whisper ${model.label}` }));
const AUTO = "auto";
const LANGUAGE_SELECT = [{ value: AUTO, label: "Detect automatically" }, ...LANGUAGE_OPTIONS.map((option) => ({ value: option.code, label: option.name }))];

/** The Transcribe dialog's defaults and the models this browser keeps (spec §10.6). */
function Transcription() {
  const model = useStoreSelector(appSettings, (state) => state.transcribeModel);
  const language = useStoreSelector(appSettings, (state) => state.transcribeLanguage ?? AUTO);
  const models = useStoreSelector(downloadedModels, (state) => state);
  useEffect(() => {
    void checkDownloadedModels();
    return releaseTranscribeWorker;
  }, []);
  const downloaded = models.cached ? WHISPER_MODELS.filter((option) => models.cached?.[option.id]) : [];
  return (
    <>
      <Row label="Model">
        <Select value={model} options={MODEL_OPTIONS} onChange={(next: WhisperModelId) => void appSettings.update({ transcribeModel: next })} label="Default transcription model" />
      </Row>
      <Row label="Language">
        <Select value={language} options={LANGUAGE_SELECT} onChange={(next) => void appSettings.update({ transcribeLanguage: next === AUTO ? null : next })} label="Default transcription language" />
      </Row>
      <Row label="Downloaded">
        <div className={styles.models} data-control="">
          {models.error && <span className={styles.muted}>Couldn't read the model cache: {models.error}</span>}
          {!models.error && !models.cached && <span className={styles.muted}>Checking…</span>}
          {models.cached && downloaded.length === 0 && <span className={styles.muted}>None: a model downloads the first time it is used.</span>}
          {downloaded.map((option) => (
            <span key={option.id} className={styles.model}>
              <span className={styles.modelName}>Whisper {option.label}</span>
              <Button control size="compact" icon={Trash2} disabled={models.removing !== null} tooltip="Delete this model's files from the browser (it downloads again next time)" onClick={() => void removeDownloadedModel(option.id)}>
                {models.removing === option.id ? "Removing…" : "Remove"}
              </Button>
            </span>
          ))}
        </div>
      </Row>
    </>
  );
}

/** The preset library folder (spec §10.3; the Presets tab's strip has the same buttons). */
function LibraryFolder() {
  const folder = useStoreSelector(presetLibrary, (state) => state.folder);
  const status = folder ? ({ syncing: "Syncing…", synced: "Synced", permission: "Needs permission: Sync to allow", error: folder.message ?? "Couldn't sync" } as const)[folder.status] : "None: presets stay in this browser";
  return (
    <Row label="Preset folder">
      <div className={styles.folder}>
        <span className={styles.folderText}>
          {folder && <span className={styles.folderName}>{folder.name}</span>}
          <span className={styles.muted}>{status}</span>
        </span>
        <span className={styles.folderButtons}>
          <Button size="compact" icon={FolderOpen} commandId="presets.chooseFolder">
            {folder ? "Change…" : "Choose…"}
          </Button>
          {folder && <IconButton commandId="presets.syncFolder" />}
          {folder && <IconButton commandId="presets.stopFolder" />}
        </span>
      </div>
    </Row>
  );
}

export function GeneralSettings() {
  const projectOpen = useStoreSelector(appView, (view) => view.project !== null);
  return (
    <div className={styles.page}>
      <Group title="Saving" note="Every save keeps the version before it in the project's history folder (the last 20): History… in the Project section restores one.">
        <AutosaveRow />
      </Group>
      <Group title="New clips">
        <DurationRow label="Still image" setting="stillDurationMs" ariaLabel="Default still image duration" />
        <DurationRow label="Title" setting="titleDurationMs" ariaLabel="Default title duration" />
        <SwitchRow label="Match clip" setting="matchClipUnderPlayhead" ariaLabel="Titles last as long as the video clip under the playhead" />
        <DurationRow label="Solid" setting="solidDurationMs" ariaLabel="Default solid duration" />
        <DurationRow label="Freeze frame" setting="freezeDurationMs" ariaLabel="Freeze frame duration" />
      </Group>
      <Group title="Transitions" note="Ctrl+Shift+D adds this transition at the nearest cut.">
        <TransitionRows withKind />
      </Group>
      <Group title="Editing">
        <SwitchRow label="Follow source" setting="keyframesFollowSource" ariaLabel="Keyframes of video and audio clips follow their source in trims and slips" />
        <Row label="Punch zoom">
          <SettingNumber setting="punchZoomScale" whole={false} ariaLabel="Punch zoom amount" unit="×" min={PUNCH_ZOOM_MIN} max={PUNCH_ZOOM_MAX} step={0.05} precision={2} />
        </Row>
        <SwitchRow label="Animate zoom" setting="punchZoomAnimate" ariaLabel="Punch zoom animates over 6 frames" />
      </Group>
      <Group title="Audio">
        <Row label="Duck depth">
          <SettingNumber setting="duckDepthDb" ariaLabel="Auto-duck depth" unit="dB" min={DUCK_DEPTH_MIN} max={DUCK_DEPTH_MAX} step={1} precision={0} />
        </Row>
        <Row label="Duck ramps">
          <SettingNumber setting="duckRampFrames" ariaLabel="Auto-duck ramp length" unit="frames" min={0} max={DUCK_RAMP_MAX} step={1} precision={0} />
        </Row>
        <Row label="Silence below">
          <SettingNumber setting="silenceThresholdDb" ariaLabel="Remove silence threshold" unit="dB" min={SILENCE_THRESHOLD.min} max={SILENCE_THRESHOLD.max} step={1} precision={0} />
        </Row>
        <Row label="Shortest silence">
          <SettingNumber setting="silenceMinMs" ariaLabel="Remove silence minimum length" unit="ms" min={SILENCE_MIN_MS.min} max={SILENCE_MIN_MS.max} step={50} precision={0} />
        </Row>
        <Row label="Keep around">
          <SettingNumber setting="silencePaddingMs" ariaLabel="Remove silence padding" unit="ms" min={SILENCE_PADDING_MS.min} max={SILENCE_PADDING_MS.max} step={10} precision={0} />
        </Row>
      </Group>
      <Group title="Transcription">
        <Transcription />
      </Group>
      <Group title="Media">
        <Row label="Import">
          <ImportMode />
        </Row>
        <ProxyRows />
      </Group>
      <Group title="Storage">
        {projectOpen && <CacheRow />}
        <LibraryFolder />
        <Row label="Starter presets">
          <div className={styles.folderButtons}>
            <Button size="compact" icon={RotateCcw} commandId="presets.restoreStarters">
              Restore
            </Button>
          </div>
        </Row>
      </Group>
    </div>
  );
}
