import { Expand, Gauge, ImageDown } from "lucide-react";
import { useEffect, useRef } from "react";
import { CanvasHost } from "../app/CanvasHost.js";
import { PanelFrame, PanelTitle } from "../app/PanelFrame.js";
import { bindPreviewTimecode, exportFrame, POOL_BUDGETS, previewDev, previewStats, previewView, setPreviewZoom, type PreviewDevState } from "../app/previewController.js";
import { sessionStore } from "../app/services.js";
import type { SessionState } from "../core/store/sessionStore.js";
import { useStoreSelector } from "../core/store/useStoreSelector.js";
import { ZOOM_CHOICES, zoomLabel, type PreviewZoom } from "../render/preview/viewport.js";
import { IconButton } from "../ui/IconButton.js";
import { Select } from "../ui/Select.js";
import styles from "./PreviewPanel.module.css";
import wellStyles from "./Well.module.css";

const ZOOM_OPTIONS = ZOOM_CHOICES.map((zoom) => ({ value: String(zoom), label: zoomLabel(zoom) }));
const BUDGET_OPTIONS = POOL_BUDGETS.map((bytes) => ({ value: String(bytes), label: `Pool ${Math.round(bytes / (1024 * 1024))} MB` }));

const selectZoom = (state: SessionState) => state.preview.zoom;
const selectStats = (state: PreviewDevState) => state.stats;
const selectBudget = (state: PreviewDevState) => state.budget;
const toggleStats = () => previewDev.set((state) => ({ ...state, stats: !state.stats }));
const setBudget = (value: string) => previewDev.set((state) => ({ ...state, budget: Number(value) }));
const setZoom = (value: string) => setPreviewZoom((value === "fit" ? "fit" : Number(value)) as PreviewZoom);

const fit = () => setPreviewZoom("fit");

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

/** Playhead timecode, written by a subscription (no React render while it changes, P1). */
function Timecode() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const element = ref.current;
    return element ? bindPreviewTimecode(element) : undefined;
  }, []);
  return <span ref={ref} className={styles.timecode} aria-label="Playhead timecode" />;
}

/**
 * Preview chrome v1 (spec §7.8): timecode, a static quality label and Fit.
 * TODO(batch 09): transport buttons, duration, fps badge; TODO(batch 24): the quality follows proxies.
 */
function PreviewChrome() {
  return (
    <>
      <Timecode />
      <span className={styles.spacer} />
      <span className={styles.quality} data-tooltip="Preview quality">
        Auto: full
      </span>
      <IconButton icon={Expand} label="Fit the frame in the panel" text="Fit" onClick={fit} />
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
    <PanelFrame id="preview" header={<PanelTitle>Preview</PanelTitle>} actions={<PreviewActions />} footer={<PreviewChrome />}>
      <div className={wellStyles.well}>
        <CanvasHost panel="preview">
          <div ref={canvasRef} className={styles.canvas} />
          {stats && <StatsOverlay />}
        </CanvasHost>
      </div>
    </PanelFrame>
  );
}
