import { useMemo, useState } from "react";
import { History, LayoutTemplate } from "lucide-react";
import { changeFrameRate, changeResolution } from "../../app/conversionController.js";
import { changeBackground, previewBackground } from "../../app/propertiesController.js";
import { appSettings, documentStore } from "../../app/services.js";
import { MAX_DIMENSION, MAX_PROJECT_NAME, MIN_DIMENSION, renameProject } from "../../core/commands/projectCommands.js";
import type { Project, RGBA } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import type { AppSettings } from "../../project/appSettings.js";
import { CUSTOM_RESOLUTION, FRAME_RATES, RESOLUTION_PRESETS, formatFps, fpsKey, parseFpsKey, resolutionPresetId } from "../../project/projectPresets.js";
import { Button } from "../../ui/Button.js";
import { ColorField } from "../../ui/ColorField.js";
import { NumberField, valueBinding } from "../../ui/NumberField.js";
import { Select } from "../../ui/Select.js";
import { TextField } from "../../ui/TextField.js";
import { AutosaveRow, CacheRow, DurationRow, ProxyRows, TransitionRows } from "../settings/SettingFields.js";
import { Row } from "./Section.js";
import styles from "./Section.module.css";

// The Project section (spec §11), shown when nothing is selected: name, resolution presets and custom
// size, frame rate, background color, the default durations and the default transition, proxies,
// autosave and the cache, then History and Save as template (spec §15). Every document edit is one
// undoable command; the rest are app settings shared with Settings > General (settings/SettingFields).
// A new frame size asks Adapt layout or Keep; a new frame rate converts every frame value, asking first
// when the conversion rounds timings (app/conversionController.ts).

const selectName = (p: Project) => p.name;
const selectWidth = (p: Project) => p.settings.width;
const selectHeight = (p: Project) => p.settings.height;
const selectFps = (p: Project) => fpsKey(p.settings.fps);
const selectBackground = (p: Project): RGBA => p.settings.background;
const selectRecent = (s: AppSettings) => s.recentColors;

const RESOLUTION_OPTIONS = [...RESOLUTION_PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: CUSTOM_RESOLUTION, label: "Custom" }];

function fpsOptions(current: string) {
  const options = FRAME_RATES.map((fps) => ({ value: fpsKey(fps), label: `${formatFps(fps)} fps` }));
  const parsed = parseFpsKey(current);
  if (parsed && !options.some((o) => o.value === current)) options.push({ value: current, label: `${formatFps(parsed)} fps` });
  return options;
}

/** A frame size field: the project's width or height, through the resolution flow (even sizes, step 2). */
function sizeBinding(axis: "width" | "height") {
  return valueBinding(
    { read: () => documentStore.getState().settings[axis], subscribe: (listener) => documentStore.subscribe(() => listener(), { affects: ["settings"] }) },
    (value) => {
      const { width, height } = documentStore.getState().settings;
      changeResolution(axis === "width" ? value : width, axis === "height" ? value : height);
    },
  );
}

export function ProjectSection() {
  const name = useStoreSelector(documentStore, selectName);
  const width = useStoreSelector(documentStore, selectWidth);
  const height = useStoreSelector(documentStore, selectHeight);
  const fps = useStoreSelector(documentStore, selectFps);
  const background = useStoreSelector(documentStore, selectBackground);
  const recent = useStoreSelector(appSettings, selectRecent);
  const sizes = useMemo(() => ({ width: sizeBinding("width"), height: sizeBinding("height") }), []);
  // "Custom" picked while the size still matches a preset: the size fields open to edits anyway.
  const [customOpen, setCustomOpen] = useState(false);
  const preset = customOpen ? CUSTOM_RESOLUTION : resolutionPresetId(width, height);
  const custom = preset === CUSTOM_RESOLUTION;

  const choosePreset = (id: string) => {
    const match = RESOLUTION_PRESETS.find((p) => p.id === id);
    setCustomOpen(!match);
    if (match) changeResolution(match.width, match.height);
  };
  const chooseFps = (key: string) => {
    const next = parseFpsKey(key);
    if (next) changeFrameRate(next);
  };

  return (
    <>
      <Row label="Name">
        <TextField value={name} onCommit={(text) => documentStore.dispatch(renameProject(text))} ariaLabel="Project name" maxLength={MAX_PROJECT_NAME} />
      </Row>
      <Row label="Resolution">
        <Select value={preset} options={RESOLUTION_OPTIONS} onChange={choosePreset} label="Resolution" />
      </Row>
      {/* Disabled, never hidden (spec §17): it shows a preset's size and opens to edits with Custom. */}
      <Row label="Size">
        <div className={styles.pair}>
          <NumberField label="W" unit="px" binding={sizes.width} min={MIN_DIMENSION} max={MAX_DIMENSION} step={2} disabled={!custom} ariaLabel="Width" />
          <NumberField label="H" unit="px" binding={sizes.height} min={MIN_DIMENSION} max={MAX_DIMENSION} step={2} disabled={!custom} ariaLabel="Height" />
        </div>
      </Row>
      <Row label="Frame rate">
        <Select value={fps} options={fpsOptions(fps)} onChange={chooseFps} label="Frame rate" />
      </Row>
      <span className={styles.hint}>Clips, keyframes, captions and markers convert to the new rate.</span>
      <Row label="Background">
        <ColorField value={background} onChange={changeBackground} onPreview={previewBackground} recent={recent} ariaLabel="Background color" />
      </Row>
      <DurationRow label="Still image" setting="stillDurationMs" ariaLabel="Default still image duration" />
      <DurationRow label="Title" setting="titleDurationMs" ariaLabel="Default title duration" />
      <TransitionRows withKind={false} />
      <AutosaveRow />
      <ProxyRows />
      <span className={styles.hint}>New proxies use these; Generate or Remove proxy in the media menu.</span>
      <CacheRow />
      <Row label="Project">
        <div className={styles.buttons}>
          <Button size="compact" icon={History} commandId="project.history">
            History…
          </Button>
          <Button size="compact" icon={LayoutTemplate} commandId="project.saveAsTemplate">
            Save as template…
          </Button>
        </div>
      </Row>
      <span className={styles.hint}>Durations, autosave and proxies apply to every project; Settings has the rest.</span>
    </>
  );
}
