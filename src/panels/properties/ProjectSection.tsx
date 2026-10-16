import { useState } from "react";
import { appSettings, documentStore } from "../../app/services.js";
import { canChangeFrameRate, MAX_DIMENSION, MAX_PROJECT_NAME, MIN_DIMENSION, renameProject, setBackground, setFrameRate, setResolution } from "../../core/commands/projectCommands.js";
import { formatHexColor, parseHexColor } from "../../core/document/color.js";
import type { Project } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { PROXY_SHORT_EDGES, type ProxyRule } from "../../media/proxy/proxyFormat.js";
import { AUTOSAVE_DELAYS_MS, type AppSettings } from "../../project/appSettings.js";
import { CUSTOM_RESOLUTION, FRAME_RATES, RESOLUTION_PRESETS, formatFps, fpsKey, parseFpsKey, resolutionPresetId } from "../../project/projectPresets.js";
import { NumberField } from "../../ui/NumberField.js";
import { Select } from "../../ui/Select.js";
import { TextField } from "../../ui/TextField.js";
import { Toggle } from "../../ui/Toggle.js";
import styles from "./ProjectSection.module.css";

const selectName = (p: Project) => p.name;
const selectWidth = (p: Project) => p.settings.width;
const selectHeight = (p: Project) => p.settings.height;
const selectFps = (p: Project) => fpsKey(p.settings.fps);
const selectBackground = (p: Project) => formatHexColor(p.settings.background);
const selectDelay = (s: AppSettings) => s.autosaveDelayMs;
const selectProxyAuto = (s: AppSettings) => s.proxyAuto;
const selectProxyRule = (s: AppSettings) => s.proxyRule;
const selectProxyEdge = (s: AppSettings) => s.proxyShortEdge;

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

/**
 * Project settings, shown when nothing is selected (spec §11). Every edit is one undoable command,
 * except the autosave delay and the proxy settings (spec §9.5), which are global app settings.
 * TODO(batch 25): collapsible section framework. TODO(batch 42): resolution "Scale layout" / fps
 * conversion dialogs, default durations, cache size and clear cache.
 */
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
  // "Custom" picked while the size still matches a preset: show the size fields anyway.
  const [customOpen, setCustomOpen] = useState(false);
  const preset = customOpen ? CUSTOM_RESOLUTION : resolutionPresetId(width, height);

  const choosePreset = (id: string) => {
    const match = RESOLUTION_PRESETS.find((p) => p.id === id);
    setCustomOpen(!match);
    if (match) documentStore.dispatch(setResolution(match.width, match.height));
  };
  const chooseFps = (key: string) => {
    const next = parseFpsKey(key);
    if (next && fpsEditable) documentStore.dispatch(setFrameRate(next));
  };
  const commitBackground = (text: string) => {
    const color = parseHexColor(text);
    if (color) documentStore.dispatch(setBackground(color));
  };

  return (
    <section className={styles.section} aria-labelledby="project-section-title">
      <h3 id="project-section-title" className={styles.title}>
        Project
      </h3>
      <div className={styles.grid}>
        <span className={styles.label}>Name</span>
        <TextField value={name} onCommit={(text) => documentStore.dispatch(renameProject(text))} ariaLabel="Project name" maxLength={MAX_PROJECT_NAME} />

        <span className={styles.label}>Resolution</span>
        <Select value={preset} options={RESOLUTION_OPTIONS} onChange={choosePreset} label="Resolution" />
        {preset === CUSTOM_RESOLUTION && (
          <>
            <span className={styles.label}>Size</span>
            <div className={styles.pair}>
              <NumberField label="W" unit="px" value={width} min={MIN_DIMENSION} max={MAX_DIMENSION} ariaLabel="Width" onChange={(w) => documentStore.dispatch(setResolution(w, height))} />
              <NumberField label="H" unit="px" value={height} min={MIN_DIMENSION} max={MAX_DIMENSION} ariaLabel="Height" onChange={(h) => documentStore.dispatch(setResolution(width, h))} />
            </div>
          </>
        )}

        <span className={styles.label}>Frame rate</span>
        <Select value={fps} options={fpsOptions(fps)} onChange={chooseFps} label="Frame rate" disabled={!fpsEditable} />
        {!fpsEditable && <span className={styles.hint}>Locked while the timeline has clips or markers.</span>}

        <span className={styles.label}>Background</span>
        <TextField value={background} onCommit={commitBackground} ariaLabel="Background color (hex)" mono maxLength={9} />

        <span className={styles.label}>Autosave</span>
        <Select value={String(delay)} options={DELAY_OPTIONS} onChange={(ms) => void appSettings.update({ autosaveDelayMs: Number(ms) })} label="Autosave delay" />

        <span className={styles.label}>Proxies</span>
        <div className={styles.switchCell}>
          <Toggle checked={proxyAuto} onChange={(on) => void appSettings.update({ proxyAuto: on })} label="Make proxies on import" />
        </div>
        <span className={styles.label}>Proxy for</span>
        <Select value={proxyRule} options={PROXY_RULE_OPTIONS} onChange={(rule) => void appSettings.update({ proxyRule: rule })} label="Videos that get a proxy" disabled={!proxyAuto} />
        <span className={styles.label}>Proxy size</span>
        <Select value={String(proxyEdge)} options={PROXY_EDGE_OPTIONS} onChange={(edge) => void appSettings.update({ proxyShortEdge: Number(edge) as AppSettings["proxyShortEdge"] })} label="Proxy short edge" />
        <span className={styles.hint}>New proxies use these; Generate or Remove proxy in the media menu.</span>
      </div>
    </section>
  );
}
