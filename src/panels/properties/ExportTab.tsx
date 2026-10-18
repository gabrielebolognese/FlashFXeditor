import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { BookmarkPlus, Captions, Copy, FileAudio, ImageDown, Trash2, Upload } from "lucide-react";
import {
  changeExportSettings,
  chooseExportPreset,
  chosenPreset,
  editableSettings,
  exportRange,
  isBuiltIn,
  presetNaming,
  requestFileName,
  saveExportPreset,
} from "../../app/exportController.js";
import { exportTab } from "../../app/exportState.js";
import { appSettings, documentStore, sessionStore } from "../../app/services.js";
import { formatTimecode } from "../../core/document/time.js";
import type { Project } from "../../core/document/types.js";
import type { SessionState } from "../../core/store/sessionStore.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import type { AudioFileFormat } from "../../export/audioExport.js";
import type { ExportDestination } from "../../export/log.js";
import {
  AUDIO_BITRATES,
  BITRATE_MODES,
  BUILT_IN_PRESETS,
  CODEC_NAMES,
  CUSTOM_PRESET_ID,
  estimateBytes,
  exportFormat,
  formatSummary,
  fpsChoices,
  HARDWARE_PREFERENCES,
  KEYFRAME_SECONDS_RANGE,
  MAX_FILE_TEMPLATE,
  MAX_PRESET_NAME,
  RESOLUTION_SCALES,
  VIDEO_BITRATE_RANGE,
  VIDEO_CODECS,
  exportSize,
  type BitrateMode,
  type ExportSettings,
  type HardwarePreference,
  type VideoCodecId,
} from "../../export/presets.js";
import { codecSupported } from "../../export/support.js";
import type { AppSettings } from "../../project/appSettings.js";
import { formatBytes } from "../../project/cache.js";
import { formatFps, fpsKey, parseFpsKey } from "../../project/projectPresets.js";
import type { SubtitleFormat } from "../../text/subtitles.js";
import { cuesOf } from "../../timeline/edit/captions.js";
import { markedRange } from "../../timeline/model/inOut.js";
import { contentEnd } from "../../timeline/model/queries.js";
import { Button } from "../../ui/Button.js";
import { NumberField, valueBinding, type NumberBinding } from "../../ui/NumberField.js";
import { Select } from "../../ui/Select.js";
import { TextField } from "../../ui/TextField.js";
import { formatRemaining } from "../../export/eta.js";
import { ExportJobs, ExportLog } from "./ExportJobs.js";
import { Row, Section } from "./Section.js";
import sectionStyles from "./Section.module.css";
import styles from "./ExportTab.module.css";

// The Export tab (spec §16, §17 "Preset chips, Range toggle, Destination, Export, Export frame, Export
// audio, Export captions, Copy frame"; Batch 44). React chrome reading narrow selectors of the app
// settings (the tab's choices), the project's size, rate and content end, and the session's range: no
// render during playback or drags. The fields of Settings edit Custom or one's own preset (a built-in
// one turns into Custom with its values, exportController.changeExportSettings). The queue's cards and
// the log are ExportJobs.tsx. The tab takes the focus (its Export button) each time it is asked for.

const selectPresetId = (s: AppSettings) => s.exportPresetId;
const selectCustom = (s: AppSettings) => s.exportCustom;
const selectPresets = (s: AppSettings) => s.exportPresets;
const selectTemplate = (s: AppSettings) => s.exportFileTemplate;
const selectDestination = (s: AppSettings) => s.exportDestination;
const selectAudioFormat = (s: AppSettings) => s.exportAudioFormat;
const selectCaptionFormat = (s: AppSettings) => s.exportCaptionFormat;
const selectSize = (p: Project) => `${p.settings.width}x${p.settings.height}`;
const selectFps = (p: Project) => fpsKey(p.settings.fps);
const selectName = (p: Project) => p.name;
const selectEnd = (p: Project) => contentEnd(p);
const selectHasCues = (p: Project) => cuesOf(p).length > 0;
const selectRangeMode = (s: SessionState) => s.exportRange;
const selectInOut = (s: SessionState) => `${s.inPoint ?? ""}:${s.outPoint ?? ""}`;
const selectTimecode = (s: SessionState) => s.timecodeFormat;
const selectNaming = (naming: boolean) => naming;
const selectFocus = (state: { focus: number }) => state.focus;

const CUSTOM_CHIP = { id: CUSTOM_PRESET_ID, name: "Custom", description: "Custom: your own codec, size, frame rate and bitrates" };
const BITRATE_LABELS: Record<BitrateMode, string> = { variable: "Variable (VBR)", constant: "Constant (CBR)" };
const HARDWARE_LABELS: Record<HardwarePreference, string> = { "no-preference": "Auto", "prefer-hardware": "Prefer hardware", "prefer-software": "Prefer software" };
const MBPS = 1_000_000;

/** A choice among a few values (spec §0: a visible chip, no dropdown): a radio with the text chip look. */
function Chip({ checked, label, tooltip, disabled, onSelect }: { checked: boolean; label: string; tooltip?: string; disabled?: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      className={styles.chip}
      data-tooltip={tooltip ?? label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={disabled ? undefined : onSelect}
    >
      {label}
    </button>
  );
}

function Chips({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={sectionStyles.chips} role="radiogroup" aria-label={label}>
      {children}
    </div>
  );
}

/** A number field bound to one of the tab's settings, shown in `scale` units (Mbps). */
function settingBinding(read: (settings: ExportSettings, project: Project) => number, write: (value: number) => Partial<ExportSettings>): NumberBinding {
  return valueBinding(
    {
      read: () => read(editableSettings(), documentStore.getState()),
      subscribe: (listener) => {
        const stops = [appSettings.subscribe(() => listener()), documentStore.subscribe(() => listener(), { affects: ["settings"] })];
        return () => {
          for (const stop of stops) stop();
        };
      },
    },
    (value) => changeExportSettings(write(value)),
  );
}

/** Which codecs this browser can encode at the tab's format (null: not asked yet, or no WebCodecs). */
function useCodecSupport(format: Parameters<typeof codecSupported>[0]): Partial<Record<VideoCodecId, boolean>> {
  const [support, setSupport] = useState<Partial<Record<VideoCodecId, boolean>>>({});
  const key = JSON.stringify([format.width, format.height, format.fps, format.videoBitrate, format.maxBitrate, format.bitrateMode, format.hardware]);
  useEffect(() => {
    let live = true;
    void Promise.all(VIDEO_CODECS.map(async (codec) => [codec, await codecSupported(format, codec)] as const)).then((answers) => {
      if (!live) return;
      const next: Partial<Record<VideoCodecId, boolean>> = {};
      for (const [codec, supported] of answers) if (supported !== null) next[codec] = supported;
      setSupport(next);
    });
    return () => {
      live = false;
    };
    // The key holds every field the answers depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return support;
}

export function ExportTab() {
  const presetId = useStoreSelector(appSettings, selectPresetId);
  const custom = useStoreSelector(appSettings, selectCustom);
  const own = useStoreSelector(appSettings, selectPresets);
  const template = useStoreSelector(appSettings, selectTemplate);
  const destination = useStoreSelector(appSettings, selectDestination);
  const audioFormat = useStoreSelector(appSettings, selectAudioFormat);
  const captionFormat = useStoreSelector(appSettings, selectCaptionFormat);
  const size = useStoreSelector(documentStore, selectSize);
  const fpsValue = useStoreSelector(documentStore, selectFps);
  const name = useStoreSelector(documentStore, selectName);
  const end = useStoreSelector(documentStore, selectEnd);
  const hasCues = useStoreSelector(documentStore, selectHasCues);
  const rangeMode = useStoreSelector(sessionStore.state, selectRangeMode);
  const inOut = useStoreSelector(sessionStore.state, selectInOut);
  const timecode = useStoreSelector(sessionStore.state, selectTimecode);
  const naming = useStoreSelector(presetNaming, selectNaming);
  const focus = useStoreSelector(exportTab, selectFocus);

  // Everything below derives from the selected values (the document is read once per change of them).
  const view = useMemo(() => {
    const project = documentStore.getState();
    const settings = appSettings.getState();
    const preset = chosenPreset(settings);
    const editable = editableSettings(settings, project);
    const format = exportFormat(project, preset.settings);
    const range = exportRange(project) ?? { start: 0, end: contentEnd(project) };
    const seconds = ((range.end - range.start) * project.settings.fps.den) / project.settings.fps.num;
    const fileName = requestFileName({ template: settings.exportFileTemplate, presetId: preset.id, presetName: preset.name }, project, "mp4");
    return { project, preset, editable, format, range, seconds, fileName };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetId, custom, own, template, size, fpsValue, name, end, rangeMode, inOut]);
  const { project, preset, editable, format, range, seconds, fileName } = view;
  // The range the in/out chip would export (null: none marked).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const inOutRange = useMemo(() => markedRange(sessionStore.state.getState(), end), [inOut, end]);
  const support = useCodecSupport(format);
  const bindings = useMemo(
    () => ({
      target: settingBinding(
        (s, p) => (typeof s.videoBitrate === "number" ? s.videoBitrate : exportFormat(p, s).videoBitrate) / MBPS,
        (value) => ({ videoBitrate: Math.round(value * MBPS) }),
      ),
      peak: settingBinding(
        (s, p) => exportFormat(p, s).maxBitrate / MBPS,
        (value) => ({ maxBitrate: Math.round(value * MBPS) }),
      ),
      keyframes: settingBinding(
        (s) => s.keyframeSeconds,
        (value) => ({ keyframeSeconds: value }),
      ),
    }),
    [],
  );

  // The tab takes the focus each time it is asked for (spec §2.2): its Export button, so Enter exports,
  // or Save as preset's name field while it is open.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = presetNaming.getState() ? 'input[aria-label="Preset name"]' : '[data-command="export.start"]';
    root.current?.querySelector<HTMLElement>(target)?.focus();
  }, [focus]);

  const presets: { id: string; name: string; description: string }[] = [...BUILT_IN_PRESETS, ...own, CUSTOM_CHIP];
  const projectFps = project.settings.fps;
  const fps = (frames: number) => formatTimecode(frames, projectFps, timecode);
  const useInOut = rangeMode === "inOut" && inOutRange !== null;
  const unsupported = support[format.codec] === false;
  const ownChosen = preset.id !== CUSTOM_PRESET_ID && !isBuiltIn(preset.id);
  const setRange = (mode: "whole" | "inOut") => sessionStore.state.set((state) => (state.exportRange === mode ? state : { ...state, exportRange: mode }));
  const scaleOptions = RESOLUTION_SCALES.map((scale) => {
    const out = exportSize(project.settings.width, project.settings.height, { scale, maxLongEdge: null, maxLongEdge4k: null });
    return { value: String(scale), label: `${scale}% · ${out.width}×${out.height}` };
  });
  const fpsOptions = fpsChoices(projectFps).map((rate) => ({ value: fpsKey(rate), label: `${formatFps(rate)} fps` }));
  const editableFps = fpsKey(exportFormat(project, editable).fps);

  return (
    <div ref={root} className={styles.tab}>
      <div className={sectionStyles.grid}>
        <Row label="Preset">
          <Chips label="Export preset">
            {presets.map((p) => (
              <Chip key={p.id} checked={p.id === preset.id} label={p.name} tooltip={p.description} onSelect={() => chooseExportPreset(p.id)} />
            ))}
          </Chips>
        </Row>
        <span className={styles.summary}>
          {formatSummary(format)}
          {unsupported && <span className={styles.notice}> · {CODEC_NAMES[format.codec]} not supported here: H.264 is used</span>}
        </span>
        <Row label="Range">
          <Chips label="Export range">
            <Chip checked={!useInOut} label="Whole timeline" onSelect={() => setRange("whole")} />
            <Chip checked={useInOut} label="In to out" tooltip={inOutRange ? "Export the in/out range" : "Mark in and out points first (I, O)"} disabled={!inOutRange} onSelect={() => setRange("inOut")} />
          </Chips>
        </Row>
        <span className={styles.summary}>
          {fps(range.start)} – {fps(range.end)} · {range.end - range.start} frames · {formatRemaining(seconds * 1000)}
        </span>
        <Row label="File name">
          <TextField value={template} onCommit={(text) => void appSettings.update({ exportFileTemplate: text })} ariaLabel="File name template" maxLength={MAX_FILE_TEMPLATE} />
        </Row>
        <span className={styles.summary}>{destination === "pick" ? `Suggested: ${fileName}` : `exports/${fileName}`}</span>
        <Row label="Save to">
          <Chips label="Export destination">
            <Chip checked={destination === "project"} label="exports folder" tooltip="The project folder's exports/" onSelect={() => setDestination("project")} />
            <Chip checked={destination === "pick"} label="Choose file…" tooltip="Pick where each export goes" onSelect={() => setDestination("pick")} />
          </Chips>
        </Row>
      </div>
      <div className={styles.action}>
        <Button variant="primary" icon={Upload} commandId="export.start">
          Export
        </Button>
        <span className={styles.estimate}>≈ {formatBytes(estimateBytes(format, seconds))}</span>
      </div>
      <Section id="exportQueue" title="Queue">
        <ExportJobs />
      </Section>
      <Section id="exportSettings" title="Settings">
        <Row label="Codec">
          <Select<VideoCodecId>
            value={editable.codec}
            options={VIDEO_CODECS.map((codec) => ({ value: codec, label: support[codec] === false ? `${CODEC_NAMES[codec]} (not supported here)` : CODEC_NAMES[codec] }))}
            onChange={(codec) => changeExportSettings({ codec })}
            label="Codec"
          />
        </Row>
        <Row label="Resolution">
          <Select value={String(editable.scale)} options={scaleOptions} onChange={(value) => changeExportSettings({ scale: Number(value) as ExportSettings["scale"] })} label="Resolution" />
        </Row>
        <Row label="Frame rate">
          <Select
            value={editableFps}
            options={fpsOptions}
            onChange={(key) => {
              const rate = parseFpsKey(key);
              if (rate) changeExportSettings({ fps: rate });
            }}
            label="Export frame rate"
          />
        </Row>
        <Row label="Bitrate">
          <Select<BitrateMode> value={editable.bitrateMode} options={BITRATE_MODES.map((mode) => ({ value: mode, label: BITRATE_LABELS[mode] }))} onChange={(bitrateMode) => changeExportSettings({ bitrateMode })} label="Bitrate mode" />
        </Row>
        <Row label="Target">
          <div className={sectionStyles.pair}>
            <NumberField binding={bindings.target} unit="Mbps" min={VIDEO_BITRATE_RANGE.min / MBPS} max={VIDEO_BITRATE_RANGE.max / MBPS} step={0.5} precision={1} ariaLabel="Target bitrate" />
            <NumberField binding={bindings.peak} label="Max" unit="Mbps" min={VIDEO_BITRATE_RANGE.min / MBPS} max={VIDEO_BITRATE_RANGE.max / MBPS} step={0.5} precision={1} disabled={editable.bitrateMode === "constant"} ariaLabel="Maximum bitrate" />
          </div>
        </Row>
        <Row label="Keyframes">
          <NumberField binding={bindings.keyframes} label="Every" unit="s" min={KEYFRAME_SECONDS_RANGE.min} max={KEYFRAME_SECONDS_RANGE.max} step={0.5} precision={1} ariaLabel="Keyframe interval" />
        </Row>
        <Row label="Audio">
          <Select value={String(editable.audioBitrate)} options={AUDIO_BITRATES.map((bps) => ({ value: String(bps), label: `AAC ${bps / 1000} kbps` }))} onChange={(value) => changeExportSettings({ audioBitrate: Number(value) })} label="Audio bitrate" />
        </Row>
        <Row label="Encoder">
          <Select<HardwarePreference> value={editable.hardware} options={HARDWARE_PREFERENCES.map((h) => ({ value: h, label: HARDWARE_LABELS[h] }))} onChange={(hardware) => changeExportSettings({ hardware })} label="Hardware acceleration" />
        </Row>
        <span className={sectionStyles.hint}>{isBuiltIn(preset.id) ? `Changing a setting switches ${preset.name} to Custom.` : "Changes are kept in this preset."}</span>
        <Row label="Presets">
          {naming ? <PresetNameField /> : <PresetButtons own={ownChosen} />}
        </Row>
      </Section>
      <Section id="exportExtras" title="Extras">
        <Row label="Frame">
          <div className={sectionStyles.textButtons}>
            <Button size="compact" commandId="preview.exportFrame" icon={ImageDown}>
              Export frame
            </Button>
            <Button size="compact" commandId="export.copyFrame" icon={Copy}>
              Copy frame
            </Button>
          </div>
        </Row>
        <Row label="Audio">
          <div className={styles.extra}>
            <Chips label="Audio file type">
              {(["wav", "m4a"] as const).map((format) => (
                <Chip key={format} checked={audioFormat === format} label={format.toUpperCase()} tooltip={format === "wav" ? "WAV: 16-bit PCM, 48 kHz stereo" : "M4A: AAC at the preset's audio bitrate"} onSelect={() => setAudioFormat(format)} />
              ))}
            </Chips>
            <Button size="compact" commandId="export.audio" icon={FileAudio}>
              Export audio
            </Button>
          </div>
        </Row>
        <Row label="Captions">
          <div className={styles.extra}>
            <Chips label="Caption file type">
              {(["srt", "vtt"] as const).map((format) => (
                <Chip key={format} checked={captionFormat === format} label={format.toUpperCase()} onSelect={() => setCaptionFormat(format)} />
              ))}
            </Chips>
            <Button size="compact" commandId="export.captions" icon={Captions} disabled={!hasCues}>
              Export captions
            </Button>
          </div>
        </Row>
        <span className={sectionStyles.hint}>Saved where exports go; audio and captions follow the range.</span>
      </Section>
      <Section id="exportLog" title="Log">
        <ExportLog />
      </Section>
    </div>
  );
}

const setDestination = (exportDestination: ExportDestination) => void appSettings.update({ exportDestination });
const setAudioFormat = (exportAudioFormat: AudioFileFormat) => void appSettings.update({ exportAudioFormat });
const setCaptionFormat = (exportCaptionFormat: SubtitleFormat) => void appSettings.update({ exportCaptionFormat });

function PresetButtons({ own }: { own: boolean }) {
  return (
    <div className={sectionStyles.textButtons}>
      <Button size="compact" commandId="export.savePreset" icon={BookmarkPlus}>
        Save as preset…
      </Button>
      <Button size="compact" commandId="export.deletePreset" icon={Trash2} disabled={!own}>
        Delete preset
      </Button>
    </div>
  );
}

/** Save as preset's name: Enter saves (and chooses it), Esc or Cancel closes. */
function PresetNameField() {
  const [name, setName] = useState("");
  const close = () => presetNaming.set(false);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    // Esc closes the field, not the Export tab.
    event.stopPropagation();
    close();
  };
  return (
    <div className={sectionStyles.withAction} onKeyDown={onKeyDown}>
      <TextField value={name} onChange={setName} onCommit={(text) => saveExportPreset(text)} ariaLabel="Preset name" placeholder="Preset name" maxLength={MAX_PRESET_NAME} autoFocus />
      <div className={sectionStyles.textButtons}>
        <Button size="compact" control variant="primary" disabled={name.trim() === ""} onClick={() => saveExportPreset(name)}>
          Save
        </Button>
        <Button size="compact" control onClick={close}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

