import { useMemo, useState, type ReactNode } from "react";
import { changeBackground, changeFrameRate, changeResolution, previewBackground } from "../../app/propertiesController.js";
import { appSettings, documentStore } from "../../app/services.js";
import { canChangeFrameRate, MAX_DIMENSION, MAX_PROJECT_NAME, MIN_DIMENSION, renameProject } from "../../core/commands/projectCommands.js";
import type { Project, RGBA } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { PROXY_SHORT_EDGES, type ProxyRule } from "../../media/proxy/proxyFormat.js";
import { AUTOSAVE_DELAYS_MS, type AppSettings } from "../../project/appSettings.js";
import { CUSTOM_RESOLUTION, FRAME_RATES, RESOLUTION_PRESETS, formatFps, fpsKey, parseFpsKey, resolutionPresetId } from "../../project/projectPresets.js";
import { IMAGE_SECONDS } from "../../timeline/edit/insertMedia.js";
import { Button } from "../../ui/Button.js";
import { ColorField } from "../../ui/ColorField.js";
import { NumberField, valueBinding } from "../../ui/NumberField.js";
import { Select } from "../../ui/Select.js";
import { TextField } from "../../ui/TextField.js";
import { Toggle } from "../../ui/Toggle.js";
import { Row } from "./Section.js";
import styles from "./Section.module.css";

// The Project section (spec §11), shown when nothing is selected: name, resolution presets and custom
// size, frame rate, background color, the default durations, proxies, autosave and the cache. Every
// document edit is one undoable command; the autosave delay, the proxy settings (§9.5) and the recent
// colors are global app settings. A resolution change goes through the conversion flow's placeholder
// (the layout scales with the frame until Batch 42 offers Scale layout / Keep); the frame rate changes
// only while the timeline is empty (Batch 42 converts frame values). The rows Batch 42 builds (default
// durations, default transition duration, cache size and Clear cache) are present and disabled.

const selectName = (p: Project) => p.name;
const selectWidth = (p: Project) => p.settings.width;
const selectHeight = (p: Project) => p.settings.height;
const selectFps = (p: Project) => fpsKey(p.settings.fps);
const selectBackground = (p: Project): RGBA => p.settings.background;
const selectDelay = (s: AppSettings) => s.autosaveDelayMs;
const selectProxyAuto = (s: AppSettings) => s.proxyAuto;
const selectProxyRule = (s: AppSettings) => s.proxyRule;
const selectProxyEdge = (s: AppSettings) => s.proxyShortEdge;
const selectRecent = (s: AppSettings) => s.recentColors;

const RESOLUTION_OPTIONS = [...RESOLUTION_PRESETS.map((p) => ({ value: p.id, label: p.label })), { value: CUSTOM_RESOLUTION, label: "Custom" }];
const DELAY_OPTIONS = AUTOSAVE_DELAYS_MS.map((ms) => ({ value: String(ms), label: `${ms / 1000} s after the last change` }));
const PROXY_RULE_OPTIONS: { value: ProxyRule; label: string }[] = [
  { value: "heavy", label: "Above 1080p or 30 fps" },
  { value: "large", label: "Above 1080p" },
  { value: "all", label: "Every video" },
];
const PROXY_EDGE_OPTIONS = PROXY_SHORT_EDGES.map((edge) => ({ value: String(edge), label: `${edge}p` }));

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

/** A row of a later batch: present and disabled (never hidden), its tooltip naming the batch in dev builds. */
function Planned({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Row label={label}>
      <span className={styles.planned} data-tooltip={import.meta.env.DEV ? `${label}: coming in Batch 42` : label}>
        {children}
      </span>
    </Row>
  );
}

export function ProjectSection() {
  const name = useStoreSelector(documentStore, selectName);
  const width = useStoreSelector(documentStore, selectWidth);
  const height = useStoreSelector(documentStore, selectHeight);
  const fps = useStoreSelector(documentStore, selectFps);
  const background = useStoreSelector(documentStore, selectBackground);
  const fpsEditable = useStoreSelector(documentStore, canChangeFrameRate);
  const delay = useStoreSelector(appSettings, selectDelay);
  const proxyAuto = useStoreSelector(appSettings, selectProxyAuto);
  const proxyRule = useStoreSelector(appSettings, selectProxyRule);
  const proxyEdge = useStoreSelector(appSettings, selectProxyEdge);
  const recent = useStoreSelector(appSettings, selectRecent);
  const sizes = useMemo(() => ({ width: sizeBinding("width"), height: sizeBinding("height") }), []);
  // "Custom" picked while the size still matches a preset: show the size fields anyway.
  const [customOpen, setCustomOpen] = useState(false);
  const preset = customOpen ? CUSTOM_RESOLUTION : resolutionPresetId(width, height);

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
      {preset === CUSTOM_RESOLUTION && (
        <Row label="Size">
          <div className={styles.pair}>
            <NumberField label="W" unit="px" binding={sizes.width} min={MIN_DIMENSION} max={MAX_DIMENSION} step={2} ariaLabel="Width" />
            <NumberField label="H" unit="px" binding={sizes.height} min={MIN_DIMENSION} max={MAX_DIMENSION} step={2} ariaLabel="Height" />
          </div>
        </Row>
      )}
      <span className={styles.hint}>A new size scales the layout with the frame.</span>
      <Row label="Frame rate">
        <Select value={fps} options={fpsOptions(fps)} onChange={chooseFps} label="Frame rate" disabled={!fpsEditable} />
      </Row>
      {!fpsEditable && <span className={styles.hint}>Locked while the timeline has clips or markers.</span>}
      <Row label="Background">
        <ColorField value={background} onChange={changeBackground} onPreview={previewBackground} recent={recent} ariaLabel="Background color" />
      </Row>
      <Planned label="Still duration">
        <TextField value={`${IMAGE_SECONDS} s`} ariaLabel="Default still duration" disabled />
      </Planned>
      <Planned label="Transition">
        <TextField value="" placeholder="--" ariaLabel="Default transition duration" disabled />
      </Planned>
      <Row label="Autosave">
        <Select value={String(delay)} options={DELAY_OPTIONS} onChange={(ms) => void appSettings.update({ autosaveDelayMs: Number(ms) })} label="Autosave delay" />
      </Row>
      <Row label="Proxies">
        <div className={styles.switchCell}>
          <Toggle checked={proxyAuto} onChange={(on) => void appSettings.update({ proxyAuto: on })} label="Make proxies on import" />
        </div>
      </Row>
      <Row label="Proxy for">
        <Select value={proxyRule} options={PROXY_RULE_OPTIONS} onChange={(rule) => void appSettings.update({ proxyRule: rule })} label="Videos that get a proxy" disabled={!proxyAuto} />
      </Row>
      <Row label="Proxy size">
        <Select value={String(proxyEdge)} options={PROXY_EDGE_OPTIONS} onChange={(edge) => void appSettings.update({ proxyShortEdge: Number(edge) as AppSettings["proxyShortEdge"] })} label="Proxy short edge" />
      </Row>
      <span className={styles.hint}>New proxies use these; Generate or Remove proxy in the media menu.</span>
      <Planned label="Cache">
        <Button size="compact" disabled>
          Clear cache
        </Button>
      </Planned>
    </>
  );
}
