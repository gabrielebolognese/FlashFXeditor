// Lottie files (spec §21.23, Batch 79): `.json` animations (bodymovin: `v`, `fr`, `ip`, `op`, `w`, `h`,
// `layers`) and `.lottie` archives (a zip with `manifest.json`, `animations/*.json` and `images/*`).
// Pure code shared by the main thread (probe), the render handler (decode.worker, export worker, CLI)
// and the tests: no DOM. The renderer (@lottiefiles/dotlottie-web, a WASM ThorVG build) gets the
// animation as JSON text, with the clip's color overrides already applied (`applyColorOverrides`).
import type { Rational, RGBA } from "../../core/document/types.js";

/** A bodymovin document: only the fields this app reads are typed. */
export interface LottieJson {
  v?: string;
  fr: number;
  ip: number;
  op: number;
  w: number;
  h: number;
  layers: unknown[];
  assets?: unknown[];
  [key: string]: unknown;
}

export type LottieFormat = "json" | "dotlottie";

/** What a probe learns about an animation. */
export interface LottieInfo {
  format: LottieFormat;
  width: number;
  height: number;
  /** The animation's frame rate (frames per second, as written in the file). */
  frameRate: number;
  /** Frames from `ip` to `op`. */
  frames: number;
  durationUs: number;
  fps: Rational;
}

export class LottieError extends Error {
  override name = "LottieError";
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** True when the bytes start a zip archive (a `.lottie` file). */
export function isZip(bytes: Uint8Array): boolean {
  return ZIP_MAGIC.every((value, index) => bytes[index] === value);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Whether parsed JSON is a bodymovin animation (the keys that identify one, checked before any other JSON use). */
export function looksLikeLottie(value: unknown): value is LottieJson {
  if (!isRecord(value)) return false;
  const finite = (key: string) => typeof value[key] === "number" && Number.isFinite(value[key]);
  return finite("fr") && finite("ip") && finite("op") && finite("w") && finite("h") && Array.isArray(value.layers);
}

/** Frame rate as a ratio of positive integers (29.97 -> 30000/1001-like: three decimals are kept). */
export function frameRateRatio(fr: number): Rational {
  if (Number.isInteger(fr)) return { num: fr, den: 1 };
  const common = (a: number, b: number): number => (b === 0 ? a : common(b, a % b));
  const num = Math.round(fr * 1000);
  const divisor = common(num, 1000);
  return { num: num / divisor, den: 1000 / divisor };
}

/** The facts of a parsed animation, or a LottieError saying what is wrong with it. */
export function describeLottie(json: LottieJson, format: LottieFormat): LottieInfo {
  const { fr, ip, op, w, h } = json;
  if (!(fr > 0) || fr > 1000) throw new LottieError(`The animation's frame rate (${fr}) is not usable`);
  if (!(op > ip)) throw new LottieError("The animation has no frames (out point is not after in point)");
  if (!(w > 0) || !(h > 0)) throw new LottieError("The animation has no size");
  if (json.layers.length === 0) throw new LottieError("The animation has no layers");
  const frames = op - ip;
  return {
    format,
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
    frameRate: fr,
    frames,
    durationUs: Math.max(1, Math.round((frames / fr) * 1_000_000)),
    fps: frameRateRatio(fr),
  };
}

// --- zip (store and deflate entries; enough for .lottie) ---------------------------------------------

interface ZipEntry {
  name: string;
  method: number;
  compressed: Uint8Array;
  size: number;
}

function readEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end of central directory record: the last 22+ bytes.
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 22 - 65535); at--) {
    if (view.getUint32(at, true) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new LottieError("The .lottie file is not a valid archive");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];
  const decoder = new TextDecoder();
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new LottieError("The .lottie archive's directory is damaged");
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    if (local + 30 > bytes.length) throw new LottieError("The .lottie archive's directory is damaged");
    const dataAt = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    entries.push({ name, method, compressed: bytes.subarray(dataAt, dataAt + compressedSize), size });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function inflate(entry: ZipEntry): Promise<Uint8Array> {
  if (entry.method === 0) return entry.compressed;
  if (entry.method !== 8) throw new LottieError(`The .lottie archive uses an unsupported compression (${entry.method})`);
  // A stream from the bytes themselves (not Blob.stream, which some environments lack).
  const source = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(new Uint8Array(entry.compressed));
      controller.close();
    },
  });
  const stream = source.pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const MIME_BY_EXTENSION: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml" };

function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** The animation JSON inside a `.lottie` archive (the manifest's first animation, else the first `animations/*.json`), with image files inlined as data URIs. */
export async function readDotLottie(bytes: Uint8Array): Promise<LottieJson> {
  const entries = readEntries(bytes);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const text = async (name: string) => new TextDecoder().decode(await inflate(byName.get(name) as ZipEntry));
  let animationName: string | undefined;
  if (byName.has("manifest.json")) {
    try {
      const manifest = JSON.parse(await text("manifest.json")) as { animations?: { id?: string }[] };
      const id = manifest.animations?.[0]?.id;
      if (typeof id === "string") animationName = [`animations/${id}.json`, `a/${id}.json`].find((name) => byName.has(name));
    } catch {
      // A damaged manifest: fall back to the first animation file.
    }
  }
  animationName ??= entries.find((entry) => /^(animations|a)\/.+\.json$/i.test(entry.name))?.name;
  if (!animationName) throw new LottieError("The .lottie archive holds no animation");
  let json: unknown;
  try {
    json = JSON.parse(await text(animationName));
  } catch {
    throw new LottieError("The animation inside the .lottie archive is not valid JSON");
  }
  if (!looksLikeLottie(json)) throw new LottieError("The animation inside the .lottie archive is not a Lottie animation");
  for (const asset of json.assets ?? []) {
    if (!isRecord(asset) || typeof asset.p !== "string" || asset.e === 1 || asset.p.startsWith("data:")) continue;
    const name = [`images/${asset.p}`, `i/${asset.p}`, `${typeof asset.u === "string" ? asset.u : ""}${asset.p}`].find((candidate) => byName.has(candidate));
    if (!name) continue;
    const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    asset.p = `data:${MIME_BY_EXTENSION[extension] ?? "image/png"};base64,${toBase64(await inflate(byName.get(name) as ZipEntry))}`;
    asset.u = "";
    asset.e = 1;
  }
  return json;
}

/** Parses a Lottie file (JSON text or a `.lottie` archive); throws a LottieError that names the problem. */
export async function readLottie(bytes: Uint8Array): Promise<{ json: LottieJson; format: LottieFormat }> {
  if (isZip(bytes)) return { json: await readDotLottie(bytes), format: "dotlottie" };
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new LottieError("The file is not a Lottie animation (not valid JSON)");
  }
  if (!looksLikeLottie(value)) throw new LottieError("The file is not a Lottie animation (no frame rate, frames, size and layers)");
  return { json: value, format: "json" };
}

// --- color overrides ----------------------------------------------------------------------------------

/** A color override of a clip (spec §21.23): colors of the animation equal to `from` (within one 8-bit step) become `to`. */
export interface ColorOverride {
  from: RGBA;
  to: RGBA;
}

const STEP = 0.5 / 255 + 1e-6;

const near = (a: number, b: number) => Math.abs(a - b) <= STEP;

/** Replaces `values[0..2]` (and the alpha, when the array has one) with `to` when they match `from`; true when it did. */
function swap(values: unknown[], overrides: readonly ColorOverride[]): boolean {
  if (values.length < 3 || !values.every((value) => typeof value === "number")) return false;
  const [r, g, b] = values as number[];
  for (const { from, to } of overrides) {
    if (near(r as number, from.r) && near(g as number, from.g) && near(b as number, from.b)) {
      values[0] = to.r;
      values[1] = to.g;
      values[2] = to.b;
      if (values.length >= 4) values[3] = to.a;
      return true;
    }
  }
  return false;
}

/** Walks the animation and swaps the colors of fills, strokes and keyed colors (`c` properties and the `s`/`e` values of their keys). Returns the number of colors replaced. */
export function applyColorOverrides(json: unknown, overrides: readonly ColorOverride[]): number {
  if (overrides.length === 0) return 0;
  let replaced = 0;
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!isRecord(node)) return;
    const color = node.c;
    if (isRecord(color) && "k" in color) {
      const keys = color.k;
      if (Array.isArray(keys)) {
        if (keys.length > 0 && keys.every((key) => typeof key === "number")) {
          if (swap(keys, overrides)) replaced += 1;
        } else {
          for (const key of keys) {
            if (!isRecord(key)) continue;
            for (const name of ["s", "e"]) {
              const values = key[name];
              if (Array.isArray(values) && swap(values, overrides)) replaced += 1;
            }
          }
        }
      }
    }
    for (const value of Object.values(node)) visit(value);
  };
  visit(json);
  return replaced;
}

/** Whether two override lists are the same (order and values). */
export function sameOverrides(a: readonly ColorOverride[] | undefined, b: readonly ColorOverride[] | undefined): boolean {
  const left = a ?? [];
  const right = b ?? [];
  return left.length === right.length && left.every((o, i) => ["r", "g", "b", "a"].every((c) => (o.from as unknown as Record<string, number>)[c] === (right[i]?.from as unknown as Record<string, number>)[c] && (o.to as unknown as Record<string, number>)[c] === (right[i]?.to as unknown as Record<string, number>)[c]));
}

// --- render variants ------------------------------------------------------------------------------------

const VARIANT_SEPARATOR = "~lc:";

const byte = (value: number) =>
  Math.round(Math.min(1, Math.max(0, value)) * 255)
    .toString(16)
    .padStart(2, "0");

const hex = (color: RGBA) => `${byte(color.r)}${byte(color.g)}${byte(color.b)}${byte(color.a)}`;

const unhex = (text: string): RGBA => ({ r: Number.parseInt(text.slice(0, 2), 16) / 255, g: Number.parseInt(text.slice(2, 4), 16) / 255, b: Number.parseInt(text.slice(4, 6), 16) / 255, a: Number.parseInt(text.slice(6, 8), 16) / 255 });

/**
 * The texture identity of a lottie clip's pictures: its media id, plus its color overrides when it has some
 * (`<mediaId>~lc:<from>><to>;...`). Clips of one media with the same overrides share frames; the id is
 * self-describing, so the renderer needs no registry.
 */
export function lottieVariantId(mediaId: string, overrides: readonly ColorOverride[] | undefined): string {
  if (!overrides || overrides.length === 0) return mediaId;
  return `${mediaId}${VARIANT_SEPARATOR}${overrides.map((o) => `${hex(o.from)}>${hex(o.to)}`).join(";")}`;
}

/** The media id and overrides a variant id stands for. */
export function parseLottieVariant(variantId: string): { mediaId: string; overrides: ColorOverride[] } {
  const at = variantId.indexOf(VARIANT_SEPARATOR);
  if (at < 0) return { mediaId: variantId, overrides: [] };
  const overrides = variantId
    .slice(at + VARIANT_SEPARATOR.length)
    .split(";")
    .filter((part) => /^[0-9a-f]{8}>[0-9a-f]{8}$/.test(part))
    .map((part) => ({ from: unhex(part.slice(0, 8)), to: unhex(part.slice(9, 17)) }));
  return { mediaId: variantId.slice(0, at), overrides };
}

/**
 * The animation time a lottie clip shows at media time `timeUs`: looped within the animation when `loop`,
 * else held on its last frame after the end (and on the first before the start).
 */
export function lottieTimeUs(timeUs: number, durationUs: number, loop: boolean): number {
  if (!(durationUs > 0)) return 0;
  if (loop) return ((timeUs % durationUs) + durationUs) % durationUs;
  return Math.min(Math.max(0, timeUs), Math.max(0, durationUs - 1));
}

/** The lottie frame (fractional, from 0) shown at animation time `timeUs`, clamped to the last frame. */
export function lottieFrameAt(timeUs: number, frameRate: number, frames: number): number {
  return Math.min(Math.max(0, (timeUs * frameRate) / 1_000_000), Math.max(0, frames - 1e-3));
}

/** The distinct colors of fills and strokes in an animation (static colors and the values of keyed ones), in order of appearance; alpha 1 for colors written with three channels. */
export function collectColors(json: unknown): RGBA[] {
  const found = new Map<string, RGBA>();
  const add = (values: unknown[]) => {
    if (values.length < 3 || !values.every((value) => typeof value === "number")) return;
    const [r, g, b, a] = values as number[];
    const color = { r: r as number, g: g as number, b: b as number, a: a ?? 1 };
    const id = `${byte(color.r)}${byte(color.g)}${byte(color.b)}`;
    if (!found.has(id)) found.set(id, color);
  };
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!isRecord(node)) return;
    const color = node.c;
    if (isRecord(color) && Array.isArray(color.k)) {
      const keys = color.k;
      if (keys.length > 0 && keys.every((key) => typeof key === "number")) add(keys);
      else
        for (const key of keys) {
          if (!isRecord(key)) continue;
          if (Array.isArray(key.s)) add(key.s);
          if (Array.isArray(key.e)) add(key.e);
        }
    }
    for (const value of Object.values(node)) visit(value);
  };
  visit(json);
  return [...found.values()];
}
