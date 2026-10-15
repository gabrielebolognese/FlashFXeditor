// Theme bridge (spec §3.7): reads the design-system CSS custom properties into a typed object for
// canvas renderers and other non-CSS consumers. Canvases never use color or size literals.
import { LABEL_COLORS, type ClipKind, type LabelColor, type Track } from "../document/types.js";
import { parseCubicBezier, type CubicBezier } from "./easing.js";

export type SpaceStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type TypeStep = "overline" | "caption" | "body" | "body-strong" | "title" | "stat" | "display";

export interface TypeStyle {
  size: number;
  line: number;
  track: number;
  weight: number;
}

export interface Theme {
  name: string;
  color: {
    bgSunken: string;
    bg: string;
    surface1: string;
    surface2: string;
    surface3: string;
    surface4: string;
    surface5: string;
    hairline: string;
    border: string;
    hoverWash: string;
    accent: string;
    accentHover: string;
    accentWash: string;
    accentDim: string;
    onAccent: string;
    textPrimary: string;
    textSecondary: string;
    textTertiary: string;
    textMuted: string;
    success: string;
    danger: string;
    dangerWash: string;
    info: string;
    live: string;
  };
  font: { ui: string; mono: string };
  type: Record<TypeStep, TypeStyle>;
  radius: { sm: number; md: number; lg: number; xl: number; island: number; pill: number };
  control: { compact: number; default: number; comfortable: number };
  icon: { size: number; small: number };
  /** The spacing scale `--space-0..6`. */
  space: Record<SpaceStep, number>;
  layout: { appBarHeight: number; panelHeaderHeight: number; splitterLine: number; splitterHit: number; previewMargin: number };
  motion: { instant: number; micro: number; standard: number; large: number };
  /** The DS easings as cubic-bezier control points (x1, y1, x2, y2). */
  ease: { out: CubicBezier };
  tooltipDelay: number;
  timeline: TimelineTheme;
  /** The stereo peak meter (CSS px). */
  meter: { barWidth: number; barGap: number; ledHeight: number };
  /** Preview overlays (CSS px) and the fullscreen chrome's hide delay (ms) (spec §7.5, §7.6, §7.8). */
  preview: { mask: string; guide: string; grid: string; pixelGrid: string; dash: number; crossSize: number; rulerSize: number; rulerTick: number; chromeHideDelay: number };
}

/** Timeline canvas metrics (CSS px) and clip colors (spec §6.2, §6.4). */
export interface TimelineTheme {
  headerWidth: number;
  rulerHeight: number;
  dividerHeight: number;
  addRowHeight: number;
  trackHeight: Record<Track["height"], number>;
  labelHeight: number;
  clipInset: number;
  selectionOutline: number;
  playheadWidth: number;
  playheadWidthActive: number;
  playheadHeadWidth: number;
  playheadHeadHeight: number;
  /** Track header toggles (target, lock, mute, solo, hide, height). */
  toggleSize: number;
  toggleGap: number;
  /** Locked track rows: diagonal hatch lines (spec §6.12). */
  lockHatch: string;
  /** Clips of tracks that are muted, hidden or not heard (another track soloed) are drawn at this opacity. */
  inactiveOpacity: number;
  playhead: string;
  /** Hover wash over a clip. */
  clipHover: string;
  /** Body and label bar color per clip kind. */
  clip: Record<ClipKind, { body: string; label: string }>;
  /** Clip drags (spec §6.6, §6.8): dead zone, auto-scroll edge band, ghosts, overwrite hatch, insert line. */
  dragThreshold: number;
  autoScrollZone: number;
  ghostOpacity: number;
  hatch: string;
  hatchGap: number;
  insertWidth: number;
  insertArrow: number;
  /** Snapping (spec §6.9): distance that snaps, in CSS px; width of the snap line. */
  snapThreshold: number;
  snapLineWidth: number;
  /** Trimming (spec §6.4, §6.10): the edge zone that trims, the width of the ghost edge, the band on a cut (roll zone). */
  trimZone: number;
  trimEdgeWidth: number;
  junctionZone: number;
  /** Cutting and gaps (spec §6.7, §6.11): the Razor's cut line, the dash of a selected gap's outline. */
  cutLineWidth: number;
  gapDash: number;
  /** The 8 label colors (spec §6.4), and the alphas a labeled clip's body and label bar are drawn at. */
  labels: Record<LabelColor, string>;
  labelBodyAlpha: number;
  labelBarAlpha: number;
  /** Clip bodies (spec §6.4): the waveform fill, the hatch over disabled or muted clips. */
  waveform: string;
  disabledHatch: string;
  /** Scrollbars (spec §6.1): trough thickness, and the shortest thumb (the horizontal one holds two zoom handles). */
  scrollbarSize: number;
  scrollbarMinThumb: number;
  /** Markers (spec §6.3): the triangle in the ruler. In/out (§6.13): the wash between the points, the bracket width, the zone that grabs a point. */
  markerWidth: number;
  markerHeight: number;
  rangeWash: string;
  rangeHandleWidth: number;
  rangeHandleZone: number;
}

/** Reads one custom property by name (e.g. `--accent`); returns "" when it is not defined. */
export type TokenReader = (name: string) => string;

const COLOR_TOKENS: Record<keyof Theme["color"], string> = {
  bgSunken: "--bg-sunken",
  bg: "--bg",
  surface1: "--surface-1",
  surface2: "--surface-2",
  surface3: "--surface-3",
  surface4: "--surface-4",
  surface5: "--surface-5",
  hairline: "--hairline",
  border: "--border",
  hoverWash: "--hover-wash",
  accent: "--accent",
  accentHover: "--accent-hover",
  accentWash: "--accent-wash",
  accentDim: "--accent-dim",
  onAccent: "--on-accent",
  textPrimary: "--text-primary",
  textSecondary: "--text-secondary",
  textTertiary: "--text-tertiary",
  textMuted: "--text-muted",
  success: "--success",
  danger: "--danger",
  dangerWash: "--danger-wash",
  info: "--info",
  live: "--live",
};

const CLIP_KINDS: readonly ClipKind[] = ["video", "audio", "image", "text", "solid", "caption"];

const TYPE_STEPS: readonly TypeStep[] = ["overline", "caption", "body", "body-strong", "title", "stat", "display"];

export function cssVarReader(element: Element): TokenReader {
  const style = getComputedStyle(element);
  return (name) => style.getPropertyValue(name).trim();
}

/** Builds a Theme from a token reader. Missing tokens are collected in `missing` instead of throwing. */
export function readTheme(read: TokenReader, root?: Element): { theme: Theme; missing: string[] } {
  const missing: string[] = [];
  const str = (name: string): string => {
    const value = read(name);
    if (value === "") missing.push(name);
    return value;
  };
  const num = (name: string): number => {
    const value = Number.parseFloat(str(name));
    return Number.isFinite(value) ? value : 0;
  };

  const color = {} as Theme["color"];
  for (const key of Object.keys(COLOR_TOKENS) as (keyof Theme["color"])[]) {
    color[key] = str(COLOR_TOKENS[key]);
  }

  const type = {} as Record<TypeStep, TypeStyle>;
  for (const step of TYPE_STEPS) {
    type[step] = {
      size: num(`--type-${step}-size`),
      line: num(`--type-${step}-line`),
      track: num(`--type-${step}-track`),
      weight: num(`--type-${step}-weight`),
    };
  }

  const space = {} as Record<SpaceStep, number>;
  for (const step of [0, 1, 2, 3, 4, 5, 6] as const) space[step] = num(`--space-${step}`);

  const clip = {} as TimelineTheme["clip"];
  for (const kind of CLIP_KINDS) clip[kind] = { body: str(`--clip-${kind}`), label: str(`--clip-${kind}-label`) };
  const labels = {} as TimelineTheme["labels"];
  for (const name of LABEL_COLORS) labels[name] = str(`--label-${name}`);

  const theme: Theme = {
    name: root?.getAttribute("data-theme") ?? "dark",
    color,
    font: { ui: str("--font-ui"), mono: str("--font-mono") },
    type,
    radius: {
      sm: num("--radius-sm"),
      md: num("--radius-md"),
      lg: num("--radius-lg"),
      xl: num("--radius-xl"),
      island: num("--radius-island"),
      pill: num("--radius-pill"),
    },
    control: {
      compact: num("--control-compact"),
      default: num("--control-default"),
      comfortable: num("--control-comfortable"),
    },
    icon: { size: num("--icon-size"), small: num("--icon-size-sm") },
    space,
    layout: {
      appBarHeight: num("--appbar-height"),
      panelHeaderHeight: num("--panel-header-height"),
      splitterLine: num("--splitter-line"),
      splitterHit: num("--splitter-hit"),
      previewMargin: num("--preview-margin"),
    },
    motion: {
      instant: num("--duration-instant"),
      micro: num("--duration-micro"),
      standard: num("--duration-standard"),
      large: num("--duration-large"),
    },
    ease: { out: parseCubicBezier(str("--ease-out")) },
    tooltipDelay: num("--tooltip-delay"),
    timeline: {
      headerWidth: num("--timeline-header-width"),
      rulerHeight: num("--timeline-ruler-height"),
      dividerHeight: num("--timeline-divider-height"),
      addRowHeight: num("--timeline-add-row-height"),
      trackHeight: { S: num("--track-height-s"), M: num("--track-height-m"), L: num("--track-height-l") },
      labelHeight: num("--clip-label-height"),
      clipInset: num("--clip-inset"),
      selectionOutline: num("--selection-outline"),
      playheadWidth: num("--playhead-width"),
      playheadWidthActive: num("--playhead-width-active"),
      playheadHeadWidth: num("--playhead-head-width"),
      playheadHeadHeight: num("--playhead-head-height"),
      toggleSize: num("--track-toggle-size"),
      toggleGap: num("--track-toggle-gap"),
      lockHatch: str("--timeline-lock-hatch"),
      inactiveOpacity: num("--timeline-inactive-opacity"),
      playhead: str("--playhead"),
      clipHover: str("--clip-hover-wash"),
      clip,
      dragThreshold: num("--timeline-drag-threshold"),
      autoScrollZone: num("--timeline-autoscroll-zone"),
      ghostOpacity: num("--timeline-ghost-opacity"),
      hatch: str("--timeline-hatch"),
      hatchGap: num("--timeline-hatch-gap"),
      insertWidth: num("--timeline-insert-width"),
      insertArrow: num("--timeline-insert-arrow"),
      snapThreshold: num("--timeline-snap-threshold"),
      snapLineWidth: num("--timeline-snap-line-width"),
      trimZone: num("--timeline-trim-zone"),
      trimEdgeWidth: num("--timeline-trim-edge-width"),
      junctionZone: num("--timeline-junction-zone"),
      cutLineWidth: num("--timeline-cut-line-width"),
      gapDash: num("--timeline-gap-dash"),
      labels,
      labelBodyAlpha: num("--clip-label-body-alpha"),
      labelBarAlpha: num("--clip-label-bar-alpha"),
      waveform: str("--clip-waveform"),
      disabledHatch: str("--clip-disabled-hatch"),
      scrollbarSize: num("--timeline-scrollbar-size"),
      scrollbarMinThumb: num("--timeline-scrollbar-min-thumb"),
      markerWidth: num("--timeline-marker-width"),
      markerHeight: num("--timeline-marker-height"),
      rangeWash: str("--timeline-range-wash"),
      rangeHandleWidth: num("--timeline-range-handle-width"),
      rangeHandleZone: num("--timeline-range-handle-zone"),
    },
    meter: { barWidth: num("--meter-bar-width"), barGap: num("--meter-bar-gap"), ledHeight: num("--meter-led-height") },
    preview: {
      mask: str("--preview-mask"),
      guide: str("--preview-guide"),
      grid: str("--preview-grid"),
      pixelGrid: str("--preview-pixel-grid"),
      dash: num("--preview-dash"),
      crossSize: num("--preview-cross-size"),
      rulerSize: num("--preview-ruler-size"),
      rulerTick: num("--preview-ruler-tick"),
      chromeHideDelay: num("--preview-chrome-hide-delay"),
    },
  };
  return { theme, missing };
}

type ThemeListener = (theme: Theme) => void;

/**
 * Holds the current Theme, re-reading it when the theme attribute (or inline token overrides) on the
 * root element change. The design system is dark-only today; `data-theme` is the switch it would use.
 */
export class ThemeBridge {
  private current: Theme | null = null;
  private readonly listeners = new Set<ThemeListener>();
  private observer: MutationObserver | null = null;

  constructor(
    private readonly root: Element,
    private readonly makeReader: (root: Element) => TokenReader = cssVarReader,
  ) {}

  get theme(): Theme {
    return this.current ?? this.refresh();
  }

  refresh(): Theme {
    const { theme, missing } = readTheme(this.makeReader(this.root), this.root);
    if (missing.length > 0) console.warn("[theme] missing design tokens:", missing.join(", "));
    this.current = theme;
    for (const listener of this.listeners) listener(theme);
    return theme;
  }

  subscribe(listener: ThemeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Starts watching `data-theme` and inline `style` on the root. Returns a stop function. */
  watch(): () => void {
    this.observer?.disconnect();
    this.observer = new MutationObserver(() => this.refresh());
    this.observer.observe(this.root, { attributes: true, attributeFilter: ["data-theme", "style"] });
    return () => {
      this.observer?.disconnect();
      this.observer = null;
    };
  }
}
