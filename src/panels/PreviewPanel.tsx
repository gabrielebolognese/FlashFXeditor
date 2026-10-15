import { Brackets, Expand, Gauge, ImageDown, Pause, Play, Repeat, SkipBack, SkipForward, StepBack, StepForward, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type MouseEvent } from "react";
import { commitMonitorVolume, meterView, previewMonitorVolume } from "../app/audioController.js";
import { CanvasHost } from "../app/CanvasHost.js";
import { PanelFrame, PanelTitle } from "../app/PanelFrame.js";
import { bindPlaybackStatus } from "../app/playbackController.js";
import { bindPreviewReadouts, exportFrame, playbackEngine, POOL_BUDGETS, previewDev, previewStats, previewView, setPreviewZoom, type PreviewDevState } from "../app/previewController.js";
import { actions, appSettings, sessionStore } from "../app/services.js";
import type { SessionState } from "../core/store/sessionStore.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { MONITOR_MAX_DB, MONITOR_MIN_DB, type AppSettings } from "../project/appSettings.js";
import { ZOOM_CHOICES, zoomLabel, type PreviewZoom } from "../render/preview/viewport.js";
import { IconButton } from "../ui/IconButton.js";
import { Knob } from "../ui/Knob.js";
import { Select } from "../ui/Select.js";
import styles from "./PreviewPanel.module.css";
import wellStyles from "./Well.module.css";

const ZOOM_OPTIONS = ZOOM_CHOICES.map((zoom) => ({ value: String(zoom), label: zoomLabel(zoom) }));
const BUDGET_OPTIONS = POOL_BUDGETS.map((bytes) => ({ value: String(bytes), label: `Pool ${Math.round(bytes / (1024 * 1024))} MB` }));

const selectZoom = (state: SessionState) => state.preview.zoom;
const selectTimecodeFormat = (state: SessionState) => state.timecodeFormat;
const selectLoop = (state: SessionState) => state.loop;
const selectStats = (state: PreviewDevState) => state.stats;
const selectBudget = (state: PreviewDevState) => state.budget;
const toggleStats = () => previewDev.set((state) => ({ ...state, stats: !state.stats }));
const setBudget = (value: string) => previewDev.set((state) => ({ ...state, budget: Number(value) }));
const setZoom = (value: string) => setPreviewZoom((value === "fit" ? "fit" : Number(value)) as PreviewZoom);

const selectMuted = (state: AppSettings) => state.monitorMuted;
const selectVolume = (state: AppSettings) => state.monitorVolumeDb;
const formatDb = (db: number) => `${db.toFixed(1)} dB`;
const keepFocus = (event: MouseEvent) => event.preventDefault();
const resetClip = () => meterView.resetClip();

const fit = () => setPreviewZoom("fit");
const run = (id: string) => () => void actions.run(id);
// Play/pause only: the engine notifies on every dropped frame too, but this snapshot changes only on play and pause (P1).
const subscribePlayback = (listener: () => void) => playbackEngine.subscribe(listener);
const isPlaying = () => playbackEngine.playing;

// TODO(batch 21): the real zoom dropdown, pan, the quality dropdown, overlays, fullscreen.
function PreviewActions() {
  const zoom = useStoreSelector(sessionStore.state, selectZoom);
  const stats = useStoreSelector(previewDev, selectStats);
  const budget = useStoreSelector(previewDev, selectBudget);
  return (
    <>
      {import.meta.env.DEV && (
        <>
          <Select label="Texture pool budget (dev)" size="compact" value={String(budget)} options={BUDGET_OPTIONS} onChange={setBudget} />
          <IconButton icon={Gauge} label="GPU stats (dev)" pressed={stats} onClick={toggleStats} />
        </>
      )}
      <Select label="Zoom" size="compact" value={String(zoom)} options={ZOOM_OPTIONS} onChange={setZoom} />
      <IconButton icon={ImageDown} label="Export frame" commandId="preview.exportFrame" onClick={() => void exportFrame()} />
    </>
  );
}

/** Dev stats text, written by `previewStats` in the scheduler loop. */
function StatsOverlay() {
  const ref = useRef<HTMLPreElement>(null);
  useEffect(() => {
    const element = ref.current;
    return element ? previewStats.attach(element) : undefined;
  }, []);
  return <pre ref={ref} className={styles.stats} aria-label="GPU stats" />;
}

/**
 * The timecode format toggle (spec §5.1): `mm:ss:ff` or `mm:ss.mmm` for the readouts, the timeline's
 * field and ruler. Renders on a toggle only.
 */
function TimecodeFormat() {
  const format = useStoreSelector(sessionStore.state, selectTimecodeFormat);
  const tooltip = format === "frames" ? "Timecode in frames (mm:ss:ff): click for milliseconds" : "Timecode in milliseconds (mm:ss.mmm): click for frames";
  return (
    <button type="button" className={styles.formatChip} aria-label={tooltip} data-tooltip={tooltip} data-command="view.toggleTimecodeFormat" onMouseDown={keepFocus} onClick={run("view.toggleTimecodeFormat")}>
      {format === "frames" ? "ff" : "ms"}
    </button>
  );
}

/** Playhead timecode, duration and fps badge, written by subscriptions (no React render while they change, P1). */
function Readouts() {
  const timecode = useRef<HTMLSpanElement>(null);
  const duration = useRef<HTMLSpanElement>(null);
  const fps = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!timecode.current || !duration.current || !fps.current) return undefined;
    return bindPreviewReadouts({ timecode: timecode.current, duration: duration.current, fps: fps.current });
  }, []);
  return (
    <div className={styles.readouts}>
      {/* First: it labels the timecode beside it, and a narrow panel clips the readouts from the right. */}
      <TimecodeFormat />
      <span ref={timecode} className={styles.timecode} aria-label="Playhead timecode" />
      <span ref={duration} className={styles.duration} aria-label="Duration" data-tooltip="Duration" />
      <span ref={fps} className={styles.badge} data-tooltip="Project frame rate" />
    </div>
  );
}

/** Transport (spec §7.8). React renders it on play and pause only. */
function Transport() {
  const playing = useSyncExternalStore(subscribePlayback, isPlaying);
  return (
    <div className={styles.transport}>
      <IconButton icon={SkipBack} label="Go to start" commandId="transport.goToStart" onClick={run("transport.goToStart")} />
      <IconButton icon={StepBack} label="Previous frame" commandId="transport.stepBack" onClick={run("transport.stepBack")} />
      <IconButton icon={playing ? Pause : Play} label={playing ? "Pause" : "Play"} commandId="transport.playPause" size="default" onClick={run("transport.playPause")} />
      <IconButton icon={StepForward} label="Next frame" commandId="transport.stepForward" onClick={run("transport.stepForward")} />
      <IconButton icon={SkipForward} label="Go to end" commandId="transport.goToEnd" onClick={run("transport.goToEnd")} />
    </div>
  );
}

/**
 * Monitoring mute and the master volume knob next to it (spec §7.8, §14: what is heard, never the
 * export). The knob drives the monitor gain directly while dragged and is stored on release.
 */
function MasterVolume() {
  const muted = useStoreSelector(appSettings, selectMuted);
  const volume = useStoreSelector(appSettings, selectVolume);
  return (
    <>
      <IconButton icon={muted ? VolumeX : Volume2} label={muted ? "Unmute" : "Mute"} commandId="audio.toggleMute" pressed={muted} onClick={run("audio.toggleMute")} />
      <Knob label="Master volume" value={volume} min={MONITOR_MIN_DB} max={MONITOR_MAX_DB} step={1} defaultValue={MONITOR_MAX_DB} format={formatDb} onInput={previewMonitorVolume} onCommit={commitMonitorVolume} />
    </>
  );
}

/** The stereo peak meter along the panel's right edge (spec §7.8), drawn by `meterView`; the top strip resets the clip LEDs. */
function MeterStrip() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = ref.current;
    return host ? meterView.mount(host) : undefined;
  }, []);
  return (
    <div className={styles.meter}>
      <div ref={ref} className={styles.meterCanvas} />
      <button type="button" className={styles.clipReset} aria-label="Reset the clip indicator" data-tooltip="Clip indicator: click to reset" onMouseDown={keepFocus} onClick={resetClip} />
    </div>
  );
}

/** Loop (spec §6.13: the in/out range when set, else the whole timeline) and Play in/out (§8, §17), whose icon is the ruler's in/out brackets. */
function LoopControls() {
  const loop = useStoreSelector(sessionStore.state, selectLoop);
  return (
    <>
      <IconButton icon={Repeat} label="Loop playback" commandId="transport.toggleLoop" pressed={loop} onClick={run("transport.toggleLoop")} />
      <IconButton icon={Brackets} label="Play in to out" commandId="transport.playInToOut" onClick={run("transport.playInToOut")} />
    </>
  );
}

/**
 * The status strip under the transport (spec §13): quality mode, dropped frames of the last playback,
 * texture pool usage (dev GPU stats on). Its texts are written in the scheduler loop.
 * TODO(batch 24): the quality label follows proxies.
 */
function StatusStrip() {
  const dropped = useRef<HTMLSpanElement>(null);
  const pool = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!dropped.current || !pool.current) return undefined;
    return bindPlaybackStatus(dropped.current, pool.current);
  }, []);
  return (
    <div className={styles.status}>
      <span className={styles.badge} data-tooltip="Preview quality">
        Auto: full
      </span>
      <span ref={dropped} className={styles.statusValue} data-tooltip="Dropped frames of the last playback" />
      <span ref={pool} className={styles.statusValue} data-tooltip="Texture pool (dev)" hidden />
    </div>
  );
}

/** Preview chrome (spec §7.8, §13): readouts, transport, mute, master volume, loop, play in/out and Fit, then the status strip. */
function PreviewChrome() {
  return (
    <>
      <div className={styles.bar}>
        <Readouts />
        <Transport />
        <div className={styles.tools}>
          <MasterVolume />
          <LoopControls />
          <IconButton icon={Expand} label="Fit the frame in the panel" text="Fit" onClick={fit} />
        </div>
      </div>
      <StatusStrip />
    </>
  );
}

export function PreviewPanel() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const stats = useStoreSelector(previewDev, selectStats);
  useEffect(() => {
    const host = canvasRef.current;
    return host ? previewView.mount(host) : undefined;
  }, []);
  return (
    <PanelFrame id="preview" header={<PanelTitle>Preview</PanelTitle>} actions={<PreviewActions />} footer={<PreviewChrome />} aside={<MeterStrip />}>
      <div className={wellStyles.well}>
        <CanvasHost panel="preview">
          <div ref={canvasRef} className={styles.canvas} />
          {stats && <StatsOverlay />}
        </CanvasHost>
      </div>
    </PanelFrame>
  );
}
