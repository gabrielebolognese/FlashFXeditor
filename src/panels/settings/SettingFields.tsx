import { useEffect, useMemo } from "react";
import { cacheInfo, cacheText, measureCache } from "../../app/cacheController.js";
import { appSettings } from "../../app/services.js";
import { TRANSITION_LABELS } from "../../core/document/transitions.js";
import { TRANSITION_KINDS, type TransitionKind } from "../../core/document/types.js";
import { useStoreSelector } from "../../core/store/useStoreSelector.js";
import { PROXY_SHORT_EDGES, type ProxyRule } from "../../media/proxy/proxyFormat.js";
import { AUTOSAVE_DELAYS_MS, DEFAULT_DURATION_MS, TRANSITION_FRAMES_MAX, type AppSettings } from "../../project/appSettings.js";
import { Button } from "../../ui/Button.js";
import { NumberField, valueBinding, type NumberBinding } from "../../ui/NumberField.js";
import { Select } from "../../ui/Select.js";
import { Toggle } from "../../ui/Toggle.js";
import { Row } from "../properties/Section.js";
import styles from "../properties/Section.module.css";

// Fields bound to the app settings (spec §11 Project section, §17 settings; Batch 42), shared by the
// Project section of the properties panel and Settings > General: every change is stored at once
// (IndexedDB `settings.v1`) and applies to every project in this browser. Rows go in a label / control
// grid (`properties/Section.module.css` `.grid`).

type NumericKey = { [K in keyof AppSettings]: AppSettings[K] extends number ? K : never }[keyof AppSettings];
type SwitchKey = { [K in keyof AppSettings]: AppSettings[K] extends boolean ? K : never }[keyof AppSettings];

/** A number field's binding to a numeric setting, shown divided by `scale` (ms as seconds: 1000); stored as a whole number unless `whole` is false. */
export function settingBinding(key: NumericKey, scale = 1, whole = true): NumberBinding {
  return valueBinding(
    { read: () => appSettings.getState()[key] / scale, subscribe: (listener) => appSettings.subscribe(() => listener()) },
    (value) => void appSettings.update({ [key]: whole ? Math.round(value * scale) : value * scale } as Partial<AppSettings>),
  );
}

/** A setting's number field (`scale` divides the stored value for display). */
export function SettingNumber(props: { setting: NumericKey; scale?: number; whole?: boolean; ariaLabel: string; unit?: string; min?: number; max?: number; step?: number; precision?: number; disabled?: boolean }) {
  const { setting, scale = 1, whole = true, ...field } = props;
  const binding = useMemo(() => settingBinding(setting, scale, whole), [setting, scale, whole]);
  return <NumberField binding={binding} {...field} />;
}

/** A default duration (stored in ms, shown in seconds). */
export function DurationRow({ label, setting, ariaLabel }: { label: string; setting: "stillDurationMs" | "titleDurationMs" | "solidDurationMs" | "freezeDurationMs"; ariaLabel: string }) {
  return (
    <Row label={label}>
      <SettingNumber setting={setting} scale={1000} ariaLabel={ariaLabel} unit="s" min={DEFAULT_DURATION_MS.min / 1000} max={DEFAULT_DURATION_MS.max / 1000} step={0.5} precision={1} />
    </Row>
  );
}

/** A switch bound to a boolean setting, at the start of the control column. */
export function SwitchRow({ label, setting, ariaLabel, disabled }: { label: string; setting: SwitchKey; ariaLabel: string; disabled?: boolean }) {
  const on = useStoreSelector(appSettings, (state) => state[setting]);
  return (
    <Row label={label}>
      <div className={styles.switchCell}>
        <Toggle checked={on} onChange={(checked) => void appSettings.update({ [setting]: checked } as Partial<AppSettings>)} label={ariaLabel} disabled={disabled} />
      </div>
    </Row>
  );
}

const DELAY_OPTIONS = AUTOSAVE_DELAYS_MS.map((ms) => ({ value: String(ms), label: `${ms / 1000} s after the last change` }));

export function AutosaveRow() {
  const delay = useStoreSelector(appSettings, (state) => state.autosaveDelayMs);
  return (
    <Row label="Autosave">
      <Select value={String(delay)} options={DELAY_OPTIONS} onChange={(ms) => void appSettings.update({ autosaveDelayMs: Number(ms) })} label="Autosave delay" />
    </Row>
  );
}

const KIND_OPTIONS = TRANSITION_KINDS.map((kind) => ({ value: kind, label: TRANSITION_LABELS[kind] }));

/** The default transition (spec §6.15): its length in frames, and with `withKind` the kind Mod+Shift+D adds. */
export function TransitionRows({ withKind }: { withKind: boolean }) {
  const kind = useStoreSelector(appSettings, (state) => state.transitionKind);
  return (
    <>
      {withKind && (
        <Row label="Transition">
          <Select value={kind} options={KIND_OPTIONS} onChange={(next: TransitionKind) => void appSettings.update({ transitionKind: next })} label="Default transition" />
        </Row>
      )}
      <Row label={withKind ? "Length" : "Transition"}>
        <SettingNumber setting="transitionFrames" ariaLabel="Default transition duration" unit="frames" min={1} max={TRANSITION_FRAMES_MAX} step={1} precision={0} />
      </Row>
    </>
  );
}

const PROXY_RULE_OPTIONS: { value: ProxyRule; label: string }[] = [
  { value: "heavy", label: "Above 1080p or 30 fps" },
  { value: "large", label: "Above 1080p" },
  { value: "all", label: "Every video" },
];
const PROXY_EDGE_OPTIONS = PROXY_SHORT_EDGES.map((edge) => ({ value: String(edge), label: `${edge}p` }));

/** Proxies (spec §9.5): made on import or not, which videos, their size. */
export function ProxyRows() {
  const auto = useStoreSelector(appSettings, (state) => state.proxyAuto);
  const rule = useStoreSelector(appSettings, (state) => state.proxyRule);
  const edge = useStoreSelector(appSettings, (state) => state.proxyShortEdge);
  return (
    <>
      <Row label="Proxies">
        <div className={styles.switchCell}>
          <Toggle checked={auto} onChange={(on) => void appSettings.update({ proxyAuto: on })} label="Make proxies on import" />
        </div>
      </Row>
      <Row label="Proxy for">
        <Select value={rule} options={PROXY_RULE_OPTIONS} onChange={(next) => void appSettings.update({ proxyRule: next })} label="Videos that get a proxy" disabled={!auto} />
      </Row>
      <Row label="Proxy size">
        <Select value={String(edge)} options={PROXY_EDGE_OPTIONS} onChange={(next) => void appSettings.update({ proxyShortEdge: Number(next) as AppSettings["proxyShortEdge"] })} label="Proxy short edge" />
      </Row>
    </>
  );
}

/** Measures at most this often while rows that show the size mount and unmount. */
const MEASURE_EVERY_MS = 5000;
let measuredAt = -Infinity;

/** The open project's cache size and Clear cache (spec §9.7, §11). */
/** The open project's cache; with no project open it stays, disabled (spec §17: never hidden, Batch 46). */
export function CacheRow({ projectOpen = true }: { projectOpen?: boolean }) {
  const info = useStoreSelector(cacheInfo, (state) => state);
  useEffect(() => {
    if (!projectOpen) return;
    const now = performance.now();
    if (cacheInfo.getState().size === null || now - measuredAt > MEASURE_EVERY_MS) {
      measuredAt = now;
      void measureCache();
    }
  }, [projectOpen]);
  return (
    <Row label="Cache">
      <div className={styles.withAction}>
        <span className={styles.value} data-cache-size="">
          {projectOpen ? cacheText(info) : "No project is open"}
        </span>
        <Button
          size="compact"
          commandId="project.clearCache"
          disabled={info.clearing || !projectOpen}
          tooltip={projectOpen ? "Delete this project's proxies, thumbnails and waveforms: they are made again" : "Open a project to clear its cache"}
        >
          Clear cache
        </Button>
      </div>
    </Row>
  );
}
