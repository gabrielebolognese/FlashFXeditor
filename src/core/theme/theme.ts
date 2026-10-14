// Theme bridge (spec §3.7): reads the design-system CSS custom properties into a typed object for
// canvas renderers and other non-CSS consumers. Canvases never use color or size literals.

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
    info: string;
    live: string;
  };
  font: { ui: string; mono: string };
  type: Record<TypeStep, TypeStyle>;
  radius: { sm: number; md: number; lg: number; xl: number; island: number; pill: number };
  control: { compact: number; default: number; comfortable: number };
  icon: { size: number; small: number };
  layout: { appBarHeight: number; panelHeaderHeight: number; splitterLine: number; splitterHit: number };
  motion: { instant: number; micro: number; standard: number; large: number };
  tooltipDelay: number;
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
  info: "--info",
  live: "--live",
};

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
    layout: {
      appBarHeight: num("--appbar-height"),
      panelHeaderHeight: num("--panel-header-height"),
      splitterLine: num("--splitter-line"),
      splitterHit: num("--splitter-hit"),
    },
    motion: {
      instant: num("--duration-instant"),
      micro: num("--duration-micro"),
      standard: num("--duration-standard"),
      large: num("--duration-large"),
    },
    tooltipDelay: num("--tooltip-delay"),
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
