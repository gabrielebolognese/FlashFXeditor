import { Brackets, Expand, Gauge, Grid3x3, ImageDown, Magnet, Maximize, Minimize, Pause, Play, Repeat, RulerDimensionLine, SkipBack, SkipForward, StepBack, StepForward, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useSyncExternalStore, type MouseEvent } from "react";
import { commitMonitorVolume, meterView, previewMonitorVolume } from "../app/audioController.js";
import { CanvasHost } from "../app/CanvasHost.js";
import { bindFullscreen, previewFullscreen } from "../app/fullscreen.js";
import { PanelFrame, PanelTitle } from "../app/PanelFrame.js";
import { bindPlaybackStatus } from "../app/playbackController.js";
import {
  bindFpsBadge,
  bindQualityLabel,
  canvasInput,
  exportFrame,
  playbackEngine,
  POOL_BUDGETS,
  previewDev,
  previewOverlay,
  previewStats,
  previewView,
  setPreviewOptions,
  setPreviewZoom,
  viewportInput,
  type PreviewDevState,
} from "../app/previewController.js";
import { actions, appSettings, focusScopes, sessionStore, themeBridge } from "../app/services.js";
import { bindTimecode } from "../app/timelineController.js";
import { GRID_DIVISIONS_MAX, GRID_DIVISIONS_MIN, type PreviewGrid, type PreviewQuality, type SafeZone, type SessionState } from "../core/store/sessionStore.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { MONITOR_MAX_DB, MONITOR_MIN_DB, type AppSettings } from "../project/appSettings.js";
import { qualityName } from "../render/preview/detail.js";
import { SAFE_ZONE_CHOICES } from "../render/preview/safeZones.js";
import { ZOOM_CHOICES, zoomLabel, type PreviewZoom } from "../render/preview/viewport.js";
import type { ContextMenuEntry } from "../ui/ContextMenu.js";
import { IconButton } from "../ui/IconButton.js";
import { Knob } from "../ui/Knob.js";
import { MenuButton } from "../ui/MenuButton.js";
import { Select } from "../ui/Select.js";
import { CanvasContextMenu } from "./CanvasContextMenu.js";
import { CropChip } from "./CropChip.js";
import styles from "./PreviewPanel.module.css";
import wellStyles from "./Well.module.css";

const BUDGET_OPTIONS = POOL_BUDGETS.map((bytes) => ({ value: String(bytes), label: `${Math.round(bytes / (1024 * 1024))} MB` }));

const selectTimecodeFormat = (state: SessionState) => state.timecodeFormat;
const selectLoop = (state: SessionState) => state.loop;
const selectSnap = (state: SessionState) => state.snap;
const selectQuality = (state: SessionState) => state.preview.quality;
const selectGuides = (state: SessionState) => state.preview.guides;
const selectSafeZone = (state: SessionState) => state.preview.safeZone;
const selectGrid = (state: SessionState) => state.preview.grid;
const selectGridDivisions = (state: SessionState) => state.preview.gridDivisions;
const selectCenterCross = (state: SessionState) => state.preview.centerCross;
const selectSafeMargins = (state: SessionState) => state.preview.safeMargins;
const selectRulers = (state: SessionState) => state.preview.rulers;
const selectPixelGrid = (state: SessionState) => state.preview.pixelGrid;
const selectStats = (state: PreviewDevState) => state.stats;
const selectBudget = (state: PreviewDevState) => state.budget;
const toggleStats = () => previewDev.set((state) => ({ ...state, stats: !state.stats }));
const setBudget = (value: string) => previewDev.set((state) => ({ ...state, budget: Number(value) }));

const selectMuted = (state: AppSettings) => state.monitorMuted;
const selectVolume = (state: AppSettings) => state.monitorVolumeDb;
const formatDb = (db: number) => `${db.toFixed(1)} dB`;
const keepFocus = (event: MouseEvent) => event.preventDefault();
const resetClip = () => meterView.resetClip();

const run = (id: string) => () => void actions.run(id);
// The preview's menus own the keyboard while open (dialog scope); it comes back to the preview after.
const backToPreview = () => focusScopes.set("preview");
// Play/pause only: the engine notifies on every dropped frame too, but this snapshot changes only on play and pause (P1).
const subscribePlayback = (listener: () => void) => playbackEngine.subscribe(listener);
const isPlaying = () => playbackEngine.playing;
const subscribeFullscreen = (listener: () => void) => previewFullscreen.subscribe(listener);
const isFullscreen = () => previewFullscreen.getState();

/** The zoom shown in its dropdown, written by a subscription: a wheel zoom never renders React (P1). */
function ZoomValue() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    return sessionStore.state.select(
      (state) => state.preview.zoom,
      (zoom) => {
        element.textContent = zoomLabel(zoom);
      },
      { fireImmediately: true },
    );
  }, []);
  return <span ref={ref} />;
}

const ZOOM_COMMANDS: Partial<Record<string, string>> = { fit: "canvas.zoomFit", "1": "canvas.zoom100", "2": "canvas.zoom200" };

/** Zoom (spec §7.8 "single click opens, single click selects"): Fit, 25-400%, and the current free zoom. */
function ZoomMenu() {
  const entries = useCallback((): ContextMenuEntry[] => {
    const current = sessionStore.state.getState().preview.zoom;
    const choices = ZOOM_CHOICES.includes(current) ? ZOOM_CHOICES : [...ZOOM_CHOICES, current].sort((a, b) => (a === "fit" ? -1 : b === "fit" ? 1 : a - b));
    return choices.map((zoom) => {
      const commandId = ZOOM_COMMANDS[String(zoom)];
      return { kind: "item", id: String(zoom), label: zoomLabel(zoom), active: zoom === current, ...(commandId && { commandId }) };
    });
  }, []);
  const select = useCallback((id: string) => setPreviewZoom((id === "fit" ? "fit" : Number(id)) as PreviewZoom), []);
  return (
    <MenuButton label="Zoom" entries={entries} onSelect={select} onClose={backToPreview}>
      <ZoomValue />
    </MenuButton>
  );
}

const QUALITIES: readonly PreviewQuality[] = ["auto", "full", "proxy", "half", "quarter"];

/** Quality (spec §7.5): Auto, Full, Proxy, 1/2, 1/4. */
function QualityMenu() {
  const quality = useStoreSelector(sessionStore.state, selectQuality);
  const entries = useCallback(
    (): ContextMenuEntry[] => QUALITIES.map((id) => ({ kind: "item", id, label: qualityName(id), active: id === quality })),
    [quality],
  );
  const select = useCallback((id: string) => setPreviewOptions({ quality: id as PreviewQuality }), []);
  return (
    <MenuButton label="Preview quality" entries={entries} onSelect={select} onClose={backToPreview}>
      {qualityName(quality)}
    </MenuButton>
  );
}

const GRIDS: readonly { id: PreviewGrid; label: string }[] = [
  { id: "none", label: "None" },
  { id: "thirds", label: "Thirds" },
  { id: "squares", label: "Squares" },
  { id: "custom", label: "Custom" },
];

/** Overlays (spec §7.6, §7.8 "safe zones + grid + guides"): one choice per group, toggles stay open. */
function OverlaysMenu() {
  const safeZone = useStoreSelector(sessionStore.state, selectSafeZone);
  const grid = useStoreSelector(sessionStore.state, selectGrid);
  const divisions = useStoreSelector(sessionStore.state, selectGridDivisions);
  const centerCross = useStoreSelector(sessionStore.state, selectCenterCross);
  const safeMargins = useStoreSelector(sessionStore.state, selectSafeMargins);
  const rulers = useStoreSelector(sessionStore.state, selectRulers);
  const pixelGrid = useStoreSelector(sessionStore.state, selectPixelGrid);
  const guides = useStoreSelector(sessionStore.state, selectGuides);
  const entries = useCallback(
    (): ContextMenuEntry[] => [
      { kind: "heading", label: "Safe zone" },
      ...SAFE_ZONE_CHOICES.map(({ id, label }): ContextMenuEntry => ({ kind: "item", id: `zone:${id}`, label, active: id === safeZone, keepOpen: true })),
      { kind: "separator" },
      { kind: "heading", label: "Grid" },
      ...GRIDS.map(({ id, label }): ContextMenuEntry => ({ kind: "item", id: `grid:${id}`, label, active: id === grid, keepOpen: true })),
      { kind: "stepper", id: "divisions", label: "Cells per side", value: divisions, min: GRID_DIVISIONS_MIN, max: GRID_DIVISIONS_MAX, disabled: grid !== "custom" },
      { kind: "separator" },
      { kind: "heading", label: "Guides" },
      { kind: "item", id: "centerCross", label: "Center cross", active: centerCross, keepOpen: true },
      { kind: "item", id: "safeMargins", label: "Title / action safe", active: safeMargins, keepOpen: true },
      { kind: "item", id: "rulers", label: "Rulers above 100%", active: rulers, keepOpen: true },
      { kind: "item", id: "pixelGrid", label: "Pixel grid from 800%", active: pixelGrid, keepOpen: true },
      { kind: "item", id: "guides", label: "Smart guides", active: guides, keepOpen: true },
    ],
    [safeZone, grid, divisions, centerCross, safeMargins, rulers, pixelGrid, guides],
  );
  const select = useCallback((id: string) => {
    const { preview } = sessionStore.state.getState();
    if (id.startsWith("zone:")) setPreviewOptions({ safeZone: id.slice(5) as SafeZone });
    else if (id.startsWith("grid:")) setPreviewOptions({ grid: id.slice(5) as PreviewGrid });
    else if (id === "divisions:dec") setPreviewOptions({ gridDivisions: Math.max(GRID_DIVISIONS_MIN, preview.gridDivisions - 1) });
    else if (id === "divisions:inc") setPreviewOptions({ gridDivisions: Math.min(GRID_DIVISIONS_MAX, preview.gridDivisions + 1) });
    else if (id === "centerCross" || id === "safeMargins" || id === "rulers" || id === "pixelGrid" || id === "guides") setPreviewOptions({ [id]: !preview[id] });
  }, []);
  const on = safeZone !== "none" || grid !== "none" || centerCross || safeMargins;
  return <MenuButton label="Overlays" icon={Grid3x3} pressed={on} entries={entries} onSelect={select} onClose={backToPreview} />;
}

/** Snap (the global toggle, mirrored, spec §13) and Guides (smart guides on the canvas). */
function SnapGuides() {
  const snap = useStoreSelector(sessionStore.state, selectSnap);
  const guides = useStoreSelector(sessionStore.state, selectGuides);
  return (
    <>
      <IconButton icon={Magnet} label="Snap" commandId="toggle.snap" pressed={snap} onClick={run("toggle.snap")} />
      <IconButton icon={RulerDimensionLine} label="Smart guides" commandId="preview.toggleGuides" pressed={guides} onClick={run("preview.toggleGuides")} />
    </>
  );
}

function FullscreenButton() {
  const fullscreen = useSyncExternalStore(subscribeFullscreen, isFullscreen);
  return <IconButton icon={fullscreen ? Minimize : Maximize} label={fullscreen ? "Exit fullscreen" : "Fullscreen"} commandId="preview.toggleFullscreen" pressed={fullscreen} onClick={run("preview.toggleFullscreen")} />;
}

/** Header (spec §13, §17): Zoom, Fit, Quality, Overlays, Snap, Guides, Fullscreen, Export frame. */
function PreviewActions() {
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
      <ZoomMenu />
      <IconButton icon={Expand} label="Fit the frame in the panel" commandId="canvas.zoomFit" onClick={run("canvas.zoomFit")} />
      <QualityMenu />
      <OverlaysMenu />
      <SnapGuides />
      <FullscreenButton />
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

/** Playhead timecode (editable, spec §7.8), duration and fps badge, written by subscriptions (no React render while they change, P1). */
function Readouts() {
  const timecode = useRef<HTMLInputElement>(null);
  const duration = useRef<HTMLSpanElement>(null);
  const fps = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!timecode.current || !duration.current || !fps.current) return undefined;
    const stops = [bindTimecode(timecode.current, duration.current), bindFpsBadge(fps.current)];
    return () => {
      for (const stop of stops) stop();
    };
  }, []);
  return (
    <div className={styles.readouts}>
      {/* First: it labels the timecode beside it, and a narrow panel clips the readouts from the right. */}
      <TimecodeFormat />
      <input
        ref={timecode}
        className={styles.timecode}
        aria-label="Playhead timecode"
        data-tooltip="Playhead: type a timecode (1:05:10), +30 or -15 frames, +2. seconds; Enter jumps, Esc cancels"
        spellCheck={false}
      />
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
 * The status strip under the transport (spec §13): quality mode and what the preview renders now,
 * dropped frames of the last playback, texture pool usage (dev GPU stats on). Its texts are written
 * outside React (the quality on change, the others in the scheduler loop).
 */
function StatusStrip() {
  const quality = useRef<HTMLSpanElement>(null);
  const dropped = useRef<HTMLSpanElement>(null);
  const pool = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!quality.current || !dropped.current || !pool.current) return undefined;
    const stops = [bindQualityLabel(quality.current), bindPlaybackStatus(dropped.current, pool.current)];
    return () => {
      for (const stop of stops) stop();
    };
  }, []);
  return (
    <div className={styles.status}>
      <span ref={quality} className={styles.badge} data-tooltip="Preview quality: the mode, then what the preview renders now" />
      <span ref={dropped} className={styles.statusValue} data-tooltip="Dropped frames of the last playback" />
      <span ref={pool} className={styles.statusValue} data-tooltip="Texture pool (dev)" hidden />
    </div>
  );
}

/** Preview chrome (spec §7.8, §13): readouts, transport, mute, master volume, loop and play in/out, then the status strip. */
function PreviewChrome() {
  return (
    <>
      <div className={styles.bar}>
        <Readouts />
        <Transport />
        <div className={styles.tools}>
          <MasterVolume />
          <LoopControls />
        </div>
      </div>
      <StatusStrip />
    </>
  );
}

const isChrome = (target: EventTarget | null) => target instanceof Element && target.closest("header, footer") !== null;
const hideDelay = () => themeBridge.theme.preview.chromeHideDelay;

export function PreviewPanel() {
  const panelRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const stats = useStoreSelector(previewDev, selectStats);
  useEffect(() => {
    const host = canvasRef.current;
    if (!host) return undefined;
    // The GPU canvas first, the overlay canvas over it, its input on the overlay: zoom and pan first,
    // then selection and the gizmo (they skip presses a pan takes).
    const stops = [previewView.mount(host), previewOverlay.mount(host)];
    const overlay = previewOverlay.element;
    if (overlay) stops.push(viewportInput.attach(overlay), canvasInput.attach(overlay));
    return () => {
      for (const stop of stops.reverse()) stop();
    };
  }, []);
  useEffect(() => {
    const panel = panelRef.current;
    return panel ? bindFullscreen(panel, isChrome, hideDelay) : undefined;
  }, []);
  return (
    <PanelFrame id="preview" panelRef={panelRef} header={<PanelTitle>Preview</PanelTitle>} actions={<PreviewActions />} footer={<PreviewChrome />} aside={<MeterStrip />}>
      <div className={wellStyles.well}>
        <CanvasHost panel="preview">
          <div ref={canvasRef} className={styles.canvas} />
          <CropChip />
          {stats && <StatsOverlay />}
        </CanvasHost>
      </div>
      <CanvasContextMenu />
    </PanelFrame>
  );
}
