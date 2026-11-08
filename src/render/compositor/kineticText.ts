// Kinetic text at a frame (spec §21.13, Batch 68): number counters, range-selector animators, the decode
// and highlight sweep presets. Everything is drawn from atlases made once (P11): the units of the layout's
// character, word or line atlas, or a glyph atlas (a text of the characters a counter or a decode may show,
// laid out in the clip's style) whose glyphs are drawn at the places the frame wants. Nothing rasterizes
// per frame; the compositor only writes `UnitState`s and glyph draws, the preview and export draw them.
// - Counter: `prefix + value + suffix` drawn glyph by glyph (digits in cells of the widest digit, so the
//   number does not jitter), aligned inside the final text's block. Animators and a block in or out
//   animation compose with it; a character, word or line in or out animation plays over the whole number.
// - Animators: `evaluateAnimators` per unit of the finest unit kind in use, composed with the active in or
//   out animation (a coarser animation's unit state is applied to the units inside it).
// - Decode: the characters not yet locked are drawn from the glyph atlas as scramble characters.
// - Highlight sweep: boxes behind the words grow with each word's presence.
// A typewriter that cuts characters out of whole lines (no animators) keeps its own path (Compositor).
import type { RGBA, TextClip, TextContent, TextStyle } from "../../core/document/types.js";
import { animUnit, newUnitState, presence, resetUnitState, typedCount, unitProgress, writeUnitShape, type ActiveAnim, type UnitState } from "../../text/anim.js";
import { evaluateAnimators, sizedStates, tintColor, type AnimatorGeometry } from "../../text/animators.js";
import { counterGlyphs, counterTextAt } from "../../text/counter.js";
import { DECODE_CHARSET, decodeSeed, isLocked, scrambleChar, DECODE_HOLD } from "../../text/decode.js";
import { applyTextCase } from "../../text/style.js";
import type { AtlasUnit, AtlasUnitKind } from "../text/atlas.js";
import { finestUnit, layoutUnits, unitIndex, unitLines } from "../text/animUnits.js";
import type { Rect, TextLayout } from "../text/layout.js";
import { currentMeasurer, textLayout } from "../text/layoutCache.js";
import type { TextAnimFrame, TextGlyphDraw } from "./drawList.js";
import { styleVariant } from "./animatedText.js";

/** The slots of a clip's glyph atlas and tint atlas (raster slots keyed `clipId + slot`). */
export const GLYPH_SLOT = "#glyphs";
export const TINT_SLOT = "#tint";

/** The yellow a highlight sweep paints when the clip has no highlighted span. */
const SWEEP_COLOR: RGBA = { r: 1, g: 0.82, b: 0.1, a: 1 };

export interface KineticFrame {
  atlas: TextAnimFrame["atlas"];
  units: UnitState[];
  background: number;
  tint: { style: TextStyle; slot: string } | null;
  glyphs: { text: TextContent; slot: string; draws: TextGlyphDraw[] } | null;
  sweep: { color: RGBA; rects: Rect[]; count: number } | null;
}

export function newKineticFrame(): KineticFrame {
  return { atlas: "block", units: [], background: 1, tint: null, glyphs: null, sweep: null };
}

/** The scratch a layer writes kinetic frames with (made once per layer). */
export interface KineticScratch {
  frame: KineticFrame;
  anim: UnitState;
  draws: TextGlyphDraw[];
  rects: Rect[];
  tint: { style: TextStyle; slot: string };
  glyphs: { text: TextContent; slot: string; draws: TextGlyphDraw[] };
  sweep: { color: RGBA; rects: Rect[]; count: number };
  geometry: { counts: Record<AtlasUnitKind, number>; index: Record<AtlasUnitKind, ArrayLike<number>> };
  chars: Int32Array;
}

export function newKineticScratch(placeholder: TextContent, style: TextStyle): KineticScratch {
  const draws: TextGlyphDraw[] = [];
  const rects: Rect[] = [];
  const empty = new Int32Array(0);
  return {
    frame: newKineticFrame(),
    anim: newUnitState(),
    draws,
    rects,
    tint: { style, slot: TINT_SLOT },
    glyphs: { text: placeholder, slot: GLYPH_SLOT, draws },
    sweep: { color: SWEEP_COLOR, rects, count: 0 },
    geometry: { counts: { char: 0, word: 0, line: 0 }, index: { char: empty, word: empty, line: empty } },
    chars: empty,
  };
}

/** Whether `clip` at its animation state needs the kinetic path. */
export function isKinetic(clip: TextClip, active: ActiveAnim | null): boolean {
  if (clip.counter) return true;
  if (clip.animators && clip.animators.length > 0) return true;
  return active !== null && (active.anim.id === "decode" || active.anim.id === "highlightSweep");
}

/** The characters of the glyph atlas of a clip at rest-or-decode: what `glyphContent` is asked for. */
export function decodeGlyphChars(layout: TextLayout, style: TextStyle): string {
  const seen = new Set<string>();
  for (const unit of layoutUnits(layout, style, "char")) seen.add(unit.text);
  for (const ch of applyTextCase(DECODE_CHARSET, style.textCase)) seen.add(ch);
  return [...seen].join("");
}

const glyphIndexCache = new WeakMap<TextLayout, Map<string, number>>();

/** The atlas unit of each character of a glyph layout. */
function glyphIndex(layout: TextLayout, style: TextStyle): Map<string, number> {
  let found = glyphIndexCache.get(layout);
  if (!found) {
    found = new Map();
    layoutUnits(layout, style, "char").forEach((unit, i) => {
      if (!found?.has(unit.text)) found?.set(unit.text, i);
    });
    glyphIndexCache.set(layout, found);
  }
  return found;
}

const advanceCache = new WeakMap<TextLayout, Map<string, number>>();

function advanceOf(layout: TextLayout, style: TextStyle, ch: string): number {
  let byChar = advanceCache.get(layout);
  if (!byChar) advanceCache.set(layout, (byChar = new Map()));
  let width = byChar.get(ch);
  if (width === undefined) {
    width = currentMeasurer().measure(ch, layout.font, style.fontSize, style.letterSpacing).width;
    byChar.set(ch, width);
  }
  return width;
}

const alignOf = (style: TextStyle): number => (style.align === "center" ? 0.5 : style.align === "right" ? 1 : 0);

/** The state of the animation at `active` for the whole text (or one unit of presence `a`), into `out`. */
function shapeFor(out: UnitState, active: ActiveAnim, a: number, em: number, height: number): UnitState {
  resetUnitState(out);
  return writeUnitShape(out, active.anim.id, active.phase, a, em, height);
}

/** `state` (a unit with origin `ox`, `oy`) moved by the animation state `a` about (`ax`, `ay`). */
function compose(state: UnitState, a: UnitState, ax: number, ay: number): void {
  const s = a.scale;
  state.x += a.x + (state.ox - ax) * (s - 1);
  state.y += a.y + (state.oy - ay) * (s - 1);
  state.scale *= s;
  state.rotation += a.rotation;
  state.opacity *= a.opacity;
  state.blur += a.blur;
  if (a.masked) state.masked = true;
  if (a.cut < state.cut) state.cut = a.cut;
}

export interface KineticDeps {
  /** The content of a glyph atlas holding `chars` (stable per clip and characters, so layouts cache). */
  glyphContent(clip: TextClip, chars: string): TextContent;
}

/**
 * The kinetic frame of `clip` at `rel` frames from its start, or null when the clip is not kinetic at
 * this frame (the compositor then writes its ordinary animation frame). `layout` and `style` are the
 * clip's own.
 */
export function writeKineticFrame(s: KineticScratch, deps: KineticDeps, clip: TextClip, rel: number, layout: TextLayout, style: TextStyle, active: ActiveAnim | null): TextAnimFrame | null {
  if (!isKinetic(clip, active)) return null;
  const f = s.frame;
  f.tint = null;
  f.glyphs = null;
  f.sweep = null;
  f.background = 1;
  const animators = clip.animators ?? [];
  if (clip.counter) return writeCounter(s, f, deps, clip, rel, layout, style, active, animators);

  const em = style.fontSize;
  const sweeping = active?.anim.id === "highlightSweep";
  const decoding = active?.anim.id === "decode";
  const kinds: AtlasUnitKind[] = animators.map((a) => a.unit);
  if (decoding) kinds.push("char");
  const unitAnim = active !== null && !sweeping && !decoding ? animUnit(active.anim) : null;
  if (unitAnim !== null && unitAnim !== "block") kinds.push(unitAnim);
  if (sweeping) writeSweep(s, f, clip, layout, style, active as ActiveAnim);
  if (kinds.length === 0) {
    // The whole text: a block animation (or none) at its place.
    f.atlas = "block";
    const state = sizedStates(f.units, 1)[0] as UnitState;
    if (active && !sweeping) shapeFor(state, active, presence(active.anim, active.phase, active.progress), em, layout.block.height);
    else resetUnitState(state);
    state.ox = layout.block.x + layout.block.width / 2;
    state.oy = layout.block.y + layout.block.height / 2;
    return f;
  }
  const dk = finestUnit(kinds);
  const units = layoutUnits(layout, style, dk);
  const n = units.length;
  if (n === 0) return null;
  f.atlas = dk;
  const states = sizedStates(f.units, n);
  let tinted = false;
  if (animators.length > 0) {
    const g = s.geometry;
    for (const kind of ["char", "word", "line"] as const) {
      g.counts[kind] = layoutUnits(layout, style, kind).length;
      g.index[kind] = unitIndex(layout, style, dk, kind);
    }
    const geometry: AnimatorGeometry = { count: n, line: unitLines(layout, style, dk), counts: g.counts, index: g.index, align: alignOf(style) };
    tinted = evaluateAnimators(animators, clip.keyframes, rel, geometry, states);
  } else for (let i = 0; i < n; i++) resetUnitState(states[i] as UnitState);
  for (let i = 0; i < n; i++) {
    const unit = units[i] as AtlasUnit;
    const state = states[i] as UnitState;
    state.ox = unit.originX;
    state.oy = unit.originY;
  }
  if (active && !sweeping) {
    if (unitAnim === null || unitAnim === "block" || decoding) {
      if (decoding) composeUnits(s, active, layout, style, dk, "char", units, states);
      else {
        const a = shapeFor(s.anim, active, presence(active.anim, active.phase, active.progress), em, layout.block.height);
        const bx = layout.block.x + layout.block.width / 2;
        const by = layout.block.y + layout.block.height / 2;
        for (let i = 0; i < n; i++) compose(states[i] as UnitState, a, bx, by);
      }
    } else composeUnits(s, active, layout, style, dk, unitAnim, units, states);
  }
  if (decoding) writeDecode(s, f, deps, clip, rel, layout, style, active as ActiveAnim, units);
  if (tinted) {
    const t = s.tint;
    t.style = styleVariant(style, style.fontSize, [tintColor.r, tintColor.g, tintColor.b, tintColor.a]);
    t.slot = TINT_SLOT;
    f.tint = t;
  }
  let shown = 0;
  for (let i = 0; i < n; i++) shown = Math.max(shown, (states[i] as UnitState).opacity);
  f.background = shown;
  return f;
}

/** Composes the active in or out animation, played per unit of kind `ak`, onto the atlas `dk` units. */
function composeUnits(s: KineticScratch, active: ActiveAnim, layout: TextLayout, style: TextStyle, dk: AtlasUnitKind, ak: AtlasUnitKind, units: readonly AtlasUnit[], states: UnitState[]): void {
  const { anim, phase, progress, length } = active;
  const own = layoutUnits(layout, style, ak);
  const count = own.length;
  const map = unitIndex(layout, style, dk, ak);
  const typed = anim.id === "typewriter" ? typedCount(phase, progress, count) : 0;
  const em = style.fontSize;
  for (let i = 0; i < units.length; i++) {
    const j = map[i] as number;
    const home = own[j] as AtlasUnit;
    const state = states[i] as UnitState;
    if (anim.id === "typewriter") {
      resetUnitState(s.anim);
      s.anim.opacity = j < typed ? 1 : 0;
    } else shapeFor(s.anim, active, presence(anim, phase, unitProgress(anim, phase, progress, j, count, length)), em, home.rect.height);
    compose(state, s.anim, home.originX, home.originY);
  }
}

/** Decode: the characters not locked yet are drawn from the glyph atlas as scramble characters. */
function writeDecode(s: KineticScratch, f: KineticFrame, deps: KineticDeps, clip: TextClip, rel: number, layout: TextLayout, style: TextStyle, active: ActiveAnim, units: readonly AtlasUnit[]): void {
  const content = deps.glyphContent(clip, decodeGlyphChars(layout, style));
  const glayout = textLayout(content, style);
  const gunits = layoutUnits(glayout, style, "char");
  const index = glyphIndex(glayout, style);
  const seed = decodeSeed(clip.id);
  const n = units.length;
  const q = active.phase === "in" ? active.progress : 1 - active.progress;
  const draws = s.draws;
  while (draws.length < n) draws.push({ glyph: -1, dx: 0, dy: 0 });
  draws.length = n;
  const bucket = Math.floor(rel / DECODE_HOLD);
  for (let i = 0; i < n; i++) {
    const unit = units[i] as AtlasUnit;
    const draw = draws[i] as TextGlyphDraw;
    draw.glyph = -1;
    draw.dx = 0;
    draw.dy = 0;
    if (isLocked(i, n, q)) continue;
    const shown = applyTextCase(scrambleChar(seed, i, bucket), style.textCase);
    const g = index.get(shown);
    const gu = g === undefined ? undefined : gunits[g];
    if (g === undefined || !gu) continue;
    draw.glyph = g;
    draw.dx = unit.originX - gu.originX;
    draw.dy = unit.baseline - gu.baseline;
  }
  s.glyphs.text = content;
  s.glyphs.slot = GLYPH_SLOT;
  f.glyphs = s.glyphs;
}

/** Highlight sweep: a box behind each word, as wide as the word times its presence. */
function writeSweep(s: KineticScratch, f: KineticFrame, clip: TextClip, layout: TextLayout, style: TextStyle, active: ActiveAnim): void {
  const kind = animUnit(active.anim);
  const own = layoutUnits(layout, style, kind === "block" ? "word" : kind);
  const count = own.length;
  const rects = s.rects;
  while (rects.length < count) rects.push({ x: 0, y: 0, width: 0, height: 0 });
  const { anim, phase, progress, length } = active;
  for (let j = 0; j < count; j++) {
    const unit = own[j] as AtlasUnit;
    const a = presence(anim, phase, unitProgress(anim, phase, progress, j, count, length));
    const r = rects[j] as Rect;
    r.x = unit.rect.x;
    r.y = unit.rect.y;
    r.width = unit.rect.width * Math.min(1, Math.max(0, a));
    r.height = unit.rect.height;
  }
  s.sweep.count = count;
  s.sweep.rects = rects;
  s.sweep.color = clip.spans?.find((span) => span.style.highlight)?.style.highlight ?? SWEEP_COLOR;
  f.sweep = s.sweep;
}

/** A counter: its characters drawn from the glyph atlas at the places of the number at this frame. */
function writeCounter(s: KineticScratch, f: KineticFrame, deps: KineticDeps, clip: TextClip, rel: number, layout: TextLayout, style: TextStyle, active: ActiveAnim | null, animators: readonly NonNullable<TextClip["animators"]>[number][]): TextAnimFrame | null {
  const counter = clip.counter;
  if (!counter) return null;
  const chars = [...counterGlyphs(counter)].filter((ch) => ch.trim() !== "").join("");
  const content = deps.glyphContent(clip, chars);
  const glayout = textLayout(content, style);
  const gunits = layoutUnits(glayout, style, "char");
  const index = glyphIndex(glayout, style);
  const text = counterTextAt(counter, clip.keyframes, rel, clip.duration);
  const line = layout.lines[0];
  const baseline = line ? line.baseline : layout.block.y + layout.block.height;
  let digit = 0;
  for (const ch of "0123456789") digit = Math.max(digit, advanceOf(layout, style, ch));
  const cells: { ch: string; x: number; adv: number }[] = [];
  let x = 0;
  for (const ch of text) {
    const adv = advanceOf(layout, style, ch);
    const cell = ch >= "0" && ch <= "9" ? digit : adv;
    cells.push({ ch, x: x + (cell - adv) / 2, adv });
    x += cell;
  }
  const start = layout.block.x + (layout.block.width - x) * alignOf(style);
  const draws = s.draws;
  const items: { g: number; ox: number; oy: number; x: number; word: number }[] = [];
  let word = 0;
  let spaced = false;
  for (const cell of cells) {
    if (cell.ch.trim() === "") {
      spaced = items.length > 0;
      continue;
    }
    if (spaced) {
      word += 1;
      spaced = false;
    }
    const g = index.get(cell.ch);
    const gu = g === undefined ? undefined : gunits[g];
    if (g === undefined || !gu) continue;
    items.push({ g, ox: start + cell.x - gu.x, oy: baseline - gu.baseline, x: start + cell.x, word });
  }
  const n = items.length;
  while (draws.length < n) draws.push({ glyph: -1, dx: 0, dy: 0 });
  draws.length = n;
  f.atlas = "glyphs";
  const states = sizedStates(f.units, n);
  const em = style.fontSize;
  for (let i = 0; i < n; i++) {
    const item = items[i] as (typeof items)[number];
    const gu = gunits[item.g] as AtlasUnit;
    const draw = draws[i] as TextGlyphDraw;
    draw.glyph = item.g;
    draw.dx = item.ox;
    draw.dy = item.oy;
    resetUnitState(states[i] as UnitState);
    (states[i] as UnitState).ox = gu.originX + item.ox;
    (states[i] as UnitState).oy = gu.originY + item.oy;
  }
  let tinted = false;
  if (animators.length > 0 && n > 0) {
    const g = s.geometry;
    const wordOf = new Int32Array(n);
    const identity = new Int32Array(n);
    const lines = new Int32Array(n);
    let words = 0;
    for (let i = 0; i < n; i++) {
      identity[i] = i;
      wordOf[i] = (items[i] as (typeof items)[number]).word;
      words = Math.max(words, wordOf[i] as number);
    }
    g.counts.char = n;
    g.counts.word = words + 1;
    g.counts.line = 1;
    g.index.char = identity;
    g.index.word = wordOf;
    g.index.line = lines;
    const own = states.map((state) => ({ ox: state.ox, oy: state.oy }));
    tinted = evaluateAnimators(animators, clip.keyframes, rel, { count: n, line: lines, counts: g.counts, index: g.index, align: alignOf(style) }, states);
    states.forEach((state, i) => {
      state.ox = (own[i] as { ox: number }).ox;
      state.oy = (own[i] as { oy: number }).oy;
    });
  }
  if (active) {
    // Any in or out animation plays over the whole number.
    const a = shapeFor(s.anim, active, presence(active.anim, active.phase, active.progress), em, layout.block.height);
    const bx = layout.block.x + layout.block.width / 2;
    const by = layout.block.y + layout.block.height / 2;
    for (let i = 0; i < n; i++) compose(states[i] as UnitState, a, bx, by);
  }
  s.glyphs.text = content;
  s.glyphs.slot = GLYPH_SLOT;
  f.glyphs = s.glyphs;
  if (tinted) {
    const t = s.tint;
    t.style = styleVariant(style, style.fontSize, [tintColor.r, tintColor.g, tintColor.b, tintColor.a]);
    t.slot = TINT_SLOT;
    f.tint = t;
  }
  let shown = 0;
  for (let i = 0; i < n; i++) shown = Math.max(shown, (states[i] as UnitState).opacity);
  f.background = shown;
  return f;
}
