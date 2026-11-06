// The Lottie frame renderer (spec §21.23, Batch 79), run in decode.worker and in the export worker's
// loopback (so an export renders with its own animations): @lottiefiles/dotlottie-web (MIT, a WASM
// ThorVG build) draws into an OffscreenCanvas. Seeking is deterministic: `setFrame(n)` renders frame n
// synchronously, so the same time gives the same pixels in the preview, the export and the CLI render.
// A renderer keeps a few animations loaded (parsed, color overrides applied, canvas at the size last
// asked for) and closes the ones it lets go of (P13).
import { applyColorOverrides, describeLottie, lottieFrameAt, parseLottieVariant, readLottie, type LottieInfo } from "./lottieFile.js";

/** The slice of dotlottie-web this renderer uses (the module is loaded on first use: it is a WASM build). */
export interface LottiePlayer {
  setFrame(frame: number): boolean | void;
  destroy(): void;
  addEventListener(event: "load" | "loadError", listener: (event: { error?: unknown }) => void): void;
}

export interface LottieEngine {
  create(canvas: OffscreenCanvas, data: object): LottiePlayer;
}

/** The size a render takes: `longEdge` px on the animation's long side, at least 1 px on the other. */
export function lottieRasterSize(width: number, height: number, longEdge: number): { width: number; height: number } {
  const scale = Math.max(1, longEdge) / Math.max(width, height, 1);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

interface Loaded {
  info: LottieInfo;
  player: LottiePlayer;
  canvas: OffscreenCanvas;
  /** The file this was parsed from (a changed file loads again). */
  stamp: string;
}

const KEPT = 4;

export class LottieRenderer {
  private readonly loaded = new Map<string, Loaded>();
  private engine: Promise<LottieEngine> | null = null;

  constructor(private readonly load: () => Promise<LottieEngine> = browserEngine) {}

  /** Renders the frames at animation times `timesUs` (each with `emit`), `longEdge` px on the long side. */
  async render(file: Blob, variant: string, timesUs: readonly number[], longEdge: number, emit: (timeUs: number, bitmap: ImageBitmap) => void, signal?: AbortSignal): Promise<void> {
    const entry = await this.open(file, variant, longEdge, signal);
    for (const timeUs of timesUs) {
      signal?.throwIfAborted();
      entry.player.setFrame(lottieFrameAt(timeUs, entry.info.frameRate, entry.info.frames));
      emit(timeUs, await createImageBitmap(entry.canvas));
    }
  }

  /** The animation's facts (size, frame rate, frames) as the renderer reads them. */
  async info(file: Blob): Promise<LottieInfo> {
    const { json, format } = await readLottie(new Uint8Array(await file.arrayBuffer()));
    return describeLottie(json, format);
  }

  /** Forgets the loaded animations of a media (every variant of it), or all of them. */
  close(mediaId?: string): void {
    for (const [key, entry] of [...this.loaded]) {
      if (mediaId !== undefined && parseLottieVariant(key).mediaId !== mediaId) continue;
      this.release(key, entry);
    }
  }

  private release(key: string, entry: Loaded): void {
    this.loaded.delete(key);
    try {
      entry.player.destroy();
    } catch {
      // Already gone.
    }
  }

  private async open(file: Blob, variant: string, longEdge: number, signal?: AbortSignal): Promise<Loaded> {
    const stamp = `${file.size}:${(file as File).lastModified ?? 0}`;
    const known = this.loaded.get(variant);
    const wanted = known ? lottieRasterSize(known.info.width, known.info.height, longEdge) : null;
    if (known && known.stamp === stamp && wanted && known.canvas.width === wanted.width && known.canvas.height === wanted.height) {
      // Most recently used last.
      this.loaded.delete(variant);
      this.loaded.set(variant, known);
      return known;
    }
    if (known) this.release(variant, known);
    const { json, format } = await readLottie(new Uint8Array(await file.arrayBuffer()));
    signal?.throwIfAborted();
    const info = describeLottie(json, format);
    applyColorOverrides(json, parseLottieVariant(variant).overrides);
    const size = lottieRasterSize(info.width, info.height, longEdge);
    const canvas = new OffscreenCanvas(size.width, size.height);
    this.engine ??= this.load();
    const engine = await this.engine;
    signal?.throwIfAborted();
    const player = engine.create(canvas, json);
    await new Promise<void>((resolve, reject) => {
      player.addEventListener("load", () => resolve());
      player.addEventListener("loadError", (event) => reject(new Error(`The animation cannot be loaded${event.error ? `: ${String(event.error)}` : ""}`)));
    });
    const entry: Loaded = { info, player, canvas, stamp };
    this.loaded.set(variant, entry);
    while (this.loaded.size > KEPT) {
      const oldest = this.loaded.entries().next().value as [string, Loaded];
      this.release(oldest[0], oldest[1]);
    }
    return entry;
  }
}

/** The poster of a Lottie file (media cards, timeline tiles): the frame at 40% of the animation (the first is often empty), at most `maxSize` px, with its WebP for cache/thumbs/. */
export async function lottiePoster(renderer: LottieRenderer, file: Blob, maxSize: number): Promise<{ bitmap: ImageBitmap; blob: Blob }> {
  const info = await renderer.info(file);
  const at = Math.floor(info.durationUs * 0.4);
  const frames: ImageBitmap[] = [];
  // The poster is its own variant: the cached player of the clips is not resized for it.
  await renderer.render(file, `poster:${Math.random().toString(36).slice(2)}`, [at], maxSize, (_time, bitmap) => frames.push(bitmap));
  const bitmap = frames[0] as ImageBitmap;
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.8 });
  return { bitmap, blob };
}

/** dotlottie-web with its WASM served as a Vite asset (no CDN): loaded the first time a Lottie is drawn. */
async function browserEngine(): Promise<LottieEngine> {
  const [{ DotLottie }, wasm] = await Promise.all([import("@lottiefiles/dotlottie-web"), import("@lottiefiles/dotlottie-web/dotlottie-player.wasm?url")]);
  DotLottie.setWasmUrl(new URL(wasm.default, self.location.href).href);
  return {
    create: (canvas, data) =>
      new DotLottie({ canvas, data: data as Record<string, unknown>, autoplay: false, loop: false, renderConfig: { devicePixelRatio: 1, autoResize: false, freezeOnOffscreen: false } }) as unknown as LottiePlayer,
  };
}

/** The worker's renderer (one per worker: the decode worker, or each export worker). */
export function createLottieRenderer(): LottieRenderer {
  return new LottieRenderer();
}
