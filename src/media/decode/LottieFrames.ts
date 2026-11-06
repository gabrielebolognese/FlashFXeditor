// Lottie frames in the texture pool (spec §21.23, §9.3, P5 to P8, Batch 79), the part of ImageService that serves
// `lottie` clips. A clip's pictures are identified by its variant id (the media id plus its color overrides,
// `lottieVariantId`); each frame is one texture keyed `(variant@edge, full, animation time in us)`, where `edge`
// is the long side in px it was rendered at (a half-octave bucket of the on-screen size, so a clip scaled to 300
// percent gets sharp frames of its own and the small ones age out of the pool by LRU).
// - decode.worker renders (`renderLottie`, the ThorVG WASM build, deterministic seeks) and the main thread only
//   uploads each bitmap and closes it right away (P5, P13).
// - The preview asks for a frame at a time (`key`); while the animation plays it also asks for the next few
//   frames in the direction it moves, in one request, so playback finds them cached (P7). A scrub that jumps far
//   asks for the one frame (the layer keeps showing the nearest frame meanwhile, P8).
// - An export asks for exact frames (`frame`) and waits for each.
import type { MediaId, MediaItem } from "../../core/document/types.js";
import type { DocumentStore } from "../../core/store/DocumentStore.js";
import type { Renderer, TextureHandle } from "../../render/gpu/renderer.js";
import { parseLottieVariant } from "../lottie/lottieFile.js";
import type { TextureKey, TexturePool } from "../cache/TexturePool.js";
import type { Priority } from "../workers/protocol.js";
import { abortError, isAbortError } from "../workers/protocol.js";
import type { WorkerPool } from "../workers/WorkerPool.js";

/** Long-edge cap of Lottie renders (the same detail cap as SVG, spec §7.1). */
export const LOTTIE_MAX_SIZE = 4096;
/** Frames requested ahead of a playing animation. */
export const LOTTIE_AHEAD = 6;
/** A step between two shown frames up to this long counts as playing or stepping (a bigger one is a jump). */
const MAX_STEP_US = 250_000;

export interface LottieFramesDeps {
  workers: Pick<WorkerPool, "request">;
  renderer: Pick<Renderer, "ready" | "maxTextureSize" | "uploadImageBitmap">;
  pool: Pick<TexturePool, "get" | "put" | "has" | "deleteMedia">;
  document: Pick<DocumentStore, "getState">;
  /** The animation file of the open project, or null when it is missing. */
  file(mediaId: MediaId): Promise<File | null>;
  /** A frame arrived (the preview redraws). */
  onChange?: (() => void) | undefined;
}

interface Wanted {
  timeUs: number;
  /** The signed step between the last two different times (0: not playing). */
  step: number;
}

export class LottieFrames {
  private readonly edges = new Map<string, number>();
  private readonly poolIds = new Map<string, Map<number, string>>();
  private readonly wanted = new Map<string, Wanted>();
  private readonly inFlight = new Map<string, AbortController>();
  /** Every edge a variant has textures at (its pool ids), so `release` finds them. */
  private readonly used = new Map<MediaId, Set<string>>();
  private readonly scratch: TextureKey = { mediaId: "", lod: "full", timeUs: 0 };
  private readonly probe: TextureKey = { mediaId: "", lod: "full", timeUs: 0 };
  private source: boolean = false;

  constructor(private readonly deps: LottieFramesDeps) {}

  attach(): void {
    this.source = true;
  }

  /** Cancels the running renders and forgets what was wanted. */
  detach(): void {
    for (const controller of this.inFlight.values()) controller.abort(abortError());
    this.inFlight.clear();
    this.wanted.clear();
    this.source = false;
  }

  /** The media record a variant id stands for, when it is a Lottie. */
  private item(variant: string): MediaItem | null {
    const id = variant.includes("~lc:") ? parseLottieVariant(variant).mediaId : variant;
    const item = this.deps.document.getState().media[id];
    return item?.kind === "lottie" ? item : null;
  }

  is(variant: string): boolean {
    return this.item(variant) !== null;
  }

  /** The animation's size (vector: rendered at the detail it is shown at), or null for other media. */
  size(variant: string): { width: number; height: number } | null {
    const item = this.item(variant);
    return item?.width && item.height ? { width: item.width, height: item.height } : null;
  }

  /** The long side the variant's frames are rendered at now. */
  edgeOf(variant: string): number {
    const known = this.edges.get(variant);
    if (known !== undefined) return known;
    const size = this.size(variant);
    return this.clampEdge(size ? Math.max(size.width, size.height) : 256);
  }

  private clampEdge(edge: number): number {
    return Math.max(1, Math.min(LOTTIE_MAX_SIZE, this.deps.renderer.maxTextureSize, Math.ceil(edge)));
  }

  /** Renders the variant's next frames at `edge` px (long side) from now on; frames of the old edge stay in the pool until evicted. */
  setEdge(variant: string, edge: number): void {
    this.edges.set(variant, this.clampEdge(edge));
  }

  private poolId(variant: string, edge: number): string {
    let byEdge = this.poolIds.get(variant);
    if (!byEdge) this.poolIds.set(variant, (byEdge = new Map()));
    let id = byEdge.get(edge);
    if (id === undefined) {
      id = `${variant}@${edge}`;
      byEdge.set(edge, id);
      const base = this.item(variant)?.id ?? variant;
      let ids = this.used.get(base);
      if (!ids) this.used.set(base, (ids = new Set()));
      ids.add(id);
    }
    return id;
  }

  /**
   * The pool key of the frame shown at animation time `timeUs` (in a scratch key valid until the next call). As a side
   * effect it notes the time, and while the animation moves it has the next frames rendered.
   */
  key(variant: string, timeUs: number): TextureKey {
    const time = Math.round(timeUs);
    const edge = this.edgeOf(variant);
    const key = this.scratch;
    key.mediaId = this.poolId(variant, edge);
    key.lod = "full";
    key.timeUs = time;
    this.note(variant, time, edge);
    return key;
  }

  private note(variant: string, time: number, edge: number): void {
    let wanted = this.wanted.get(variant);
    if (!wanted) this.wanted.set(variant, (wanted = { timeUs: time, step: 0 }));
    const durationUs = this.item(variant)?.durationUs ?? 0;
    if (time !== wanted.timeUs) {
      let delta = time - wanted.timeUs;
      // A loop wraps: the step is the short way round.
      if (durationUs > 0 && Math.abs(delta) > durationUs / 2) delta -= Math.sign(delta) * durationUs;
      wanted.step = Math.abs(delta) <= MAX_STEP_US ? delta : 0;
      wanted.timeUs = time;
    }
    if (wanted.step === 0 || !this.source) return;
    const last = this.at(time + wanted.step * LOTTIE_AHEAD, durationUs);
    this.probe.mediaId = this.poolId(variant, edge);
    this.probe.timeUs = last;
    if (this.deps.pool.has(this.probe)) return;
    const times: number[] = [];
    for (let k = 1; k <= LOTTIE_AHEAD; k++) times.push(this.at(time + wanted.step * k, durationUs));
    this.fetch(variant, edge, times, "playback").catch(() => undefined);
  }

  private at(timeUs: number, durationUs: number): number {
    const rounded = Math.round(timeUs);
    return durationUs > 0 ? ((rounded % durationUs) + durationUs) % durationUs : Math.max(0, rounded);
  }

  /** The texture of the frame last asked for (null when it is not loaded yet). */
  get(variant: string): TextureHandle | null {
    const time = this.wanted.get(variant)?.timeUs ?? 0;
    const edge = this.edgeOf(variant);
    this.probe.mediaId = this.poolId(variant, edge);
    this.probe.timeUs = time;
    return this.deps.pool.get(this.probe);
  }

  /** Renders the frame last asked for (the first frame when none was) and resolves with its texture; null when it cannot be shown now. */
  async load(variant: string): Promise<TextureHandle | null> {
    if (!this.source) return null;
    const time = this.wanted.get(variant)?.timeUs ?? 0;
    const edge = this.edgeOf(variant);
    await this.fetch(variant, edge, [time], "user");
    return this.get(variant);
  }

  /**
   * Renders the exact frame at `timeUs` at `edge` px (long side) and resolves with its texture, for an export (Export
   * frame): the same pixels whenever it is asked, whichever backend draws them.
   */
  async frame(variant: string, timeUs: number, edge: number, signal?: AbortSignal): Promise<{ key: TextureKey; texture: TextureHandle } | null> {
    const cap = this.clampEdge(edge);
    const time = Math.round(timeUs);
    const key: TextureKey = { mediaId: this.poolId(variant, cap), lod: "full", timeUs: time };
    let texture = this.deps.pool.get(key);
    if (!texture) {
      await this.fetch(variant, cap, [time], "user", signal);
      texture = this.deps.pool.get(key);
    }
    return texture ? { key, texture } : null;
  }

  /** Renders the frames of `times` the pool does not hold (the ones already being rendered are awaited), uploading each as it arrives. */
  private async fetch(variant: string, edge: number, times: readonly number[], priority: Priority, outer?: AbortSignal): Promise<void> {
    const { pool, renderer, workers } = this.deps;
    const base = this.item(variant);
    if (!base) return;
    const poolId = this.poolId(variant, edge);
    const key: TextureKey = { mediaId: poolId, lod: "full", timeUs: 0 };
    const missing = times.filter((time) => {
      key.timeUs = time;
      return !pool.has(key) && !this.inFlight.has(`${poolId}|${time}`);
    });
    if (missing.length === 0) {
      // Already on its way (a request of the preview): wait for it so a caller that needs the frame sees it.
      const waiting = times.map((time) => this.inFlight.get(`${poolId}|${time}`)).filter((controller): controller is AbortController => controller !== undefined);
      if (waiting.length > 0) await this.settled(waiting, outer);
      return;
    }
    const file = await this.deps.file(base.id);
    if (!file) throw new Error("The animation file is missing");
    const controller = new AbortController();
    const forward = () => controller.abort(outer?.reason ?? abortError());
    outer?.addEventListener("abort", forward, { once: true });
    for (const time of missing) this.inFlight.set(`${poolId}|${time}`, controller);
    try {
      await workers.request(
        "renderLottie",
        { file, variant, timesUs: [...missing], longEdge: edge },
        {
          priority,
          signal: controller.signal,
          onProgress: (value) => {
            try {
              const put = { mediaId: poolId, lod: "full" as const, timeUs: value.timeUs };
              if (controller.signal.aborted || !renderer.ready || pool.has(put)) return;
              pool.put(put, renderer.uploadImageBitmap(value.bitmap, { label: `${base.name} ${value.timeUs}` }));
              this.deps.onChange?.();
            } finally {
              value.bitmap.close();
            }
          },
        },
      );
    } catch (error) {
      if (!isAbortError(error)) throw error;
    } finally {
      outer?.removeEventListener("abort", forward);
      for (const time of missing) if (this.inFlight.get(`${poolId}|${time}`) === controller) this.inFlight.delete(`${poolId}|${time}`);
    }
  }

  /** Resolves when the given in-flight renders are no longer running. */
  private async settled(controllers: AbortController[], outer?: AbortSignal): Promise<void> {
    const pending = new Set(controllers);
    while (pending.size > 0 && !outer?.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 4));
      for (const controller of [...pending]) if (![...this.inFlight.values()].includes(controller)) pending.delete(controller);
    }
  }

  /** A media left the project: its renders stop and its textures go (P13). */
  release(mediaId: MediaId): void {
    for (const [id, controller] of [...this.inFlight]) {
      if (parseLottieVariant(id.split("|")[0] as string).mediaId.split("@")[0] !== mediaId) continue;
      controller.abort(abortError());
      this.inFlight.delete(id);
    }
    for (const id of this.used.get(mediaId) ?? []) this.deps.pool.deleteMedia(id);
    this.used.delete(mediaId);
    for (const map of [this.edges, this.wanted] as Map<string, unknown>[]) for (const variant of [...map.keys()]) if (parseLottieVariant(variant).mediaId === mediaId) map.delete(variant);
    for (const variant of [...this.poolIds.keys()]) if (parseLottieVariant(variant).mediaId === mediaId) this.poolIds.delete(variant);
    this.deps.workers.request("closeLottie", { mediaId }, { priority: "background" }).catch(() => undefined);
  }
}
