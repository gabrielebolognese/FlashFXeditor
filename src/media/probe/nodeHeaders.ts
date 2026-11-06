// Media header readers for Node (spec §21.3, Batch 55): what the project CLI learns from a file without a
// browser. MP4, MOV and M4A go through the app's own mp4box probe and WebM through its EBML demuxer (both
// run on a Blob); WAV, MP3, OGG, PNG, JPEG, WebP, GIF and SVG are small pure readers here. Every reader
// answers with a `ProbeResult`, the shape the app's importer turns into a media record, and throws a
// `ProbeError` for a file it cannot read (left for the app's repair on open, §21.5). No DOM.
import { probeLottie } from "./lottieProbe.js";
import { probeVideoFile } from "../demux/container.js";
import { frameDurationUs } from "../decode/animation.js";
import { ticksToUs } from "../../core/document/time.js";
import { classifyFile } from "../mediaKinds.js";
import { svgSizeFromAttributes } from "./svgProbe.js";
import { ProbeError, type ProbeResult } from "./types.js";

const bad = (what: string): ProbeError => new ProbeError(`not a readable ${what} file`);
const ascii = (bytes: Uint8Array, at: number, length: number): string => String.fromCharCode(...bytes.subarray(at, at + length));
const u16le = (b: Uint8Array, at: number): number => (b[at] as number) | ((b[at + 1] as number) << 8);
const u24le = (b: Uint8Array, at: number): number => u16le(b, at) | ((b[at + 2] as number) << 16);
const u32le = (b: Uint8Array, at: number): number => (u24le(b, at) | ((b[at + 3] as number) << 24)) >>> 0;
const u32be = (b: Uint8Array, at: number): number => (((b[at] as number) << 24) | ((b[at + 1] as number) << 16) | ((b[at + 2] as number) << 8) | (b[at + 3] as number)) >>> 0;

async function bytesOf(file: Blob, start = 0, end = file.size): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

// --- WAV ----------------------------------------------------------------------------------------------

export function wavHeader(bytes: Uint8Array): ProbeResult {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") throw bad("WAV");
  let channels = 0;
  let rate = 0;
  let blockAlign = 0;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = ascii(bytes, at, 4);
    let size = u32le(bytes, at + 4);
    if (id === "fmt " && at + 24 <= bytes.length) {
      channels = u16le(bytes, at + 10);
      rate = u32le(bytes, at + 12);
      blockAlign = u16le(bytes, at + 20);
    } else if (id === "data") {
      if (!(channels > 0 && rate > 0 && blockAlign > 0)) throw bad("WAV");
      // A streamed file gives 0 or 0xFFFFFFFF: the data runs to the end of the file.
      if (size === 0 || at + 8 + size > bytes.length) size = bytes.length - at - 8;
      return { kind: "audio", durationUs: ticksToUs(Math.floor(size / blockAlign), rate), hasAudio: true, audioCodec: "pcm", audio: { channels, sampleRate: rate } };
    }
    at += 8 + size + (size % 2);
  }
  throw bad("WAV");
}

// --- MP3 ----------------------------------------------------------------------------------------------

const MPEG1_BITRATES = [
  [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
] as const;
const MPEG2_BITRATES = [[0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]] as const;
const MPEG_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] } as const;

interface Mp3Frame {
  length: number;
  samples: number;
  rate: number;
  channels: number;
}

function mp3Frame(bytes: Uint8Array, at: number): Mp3Frame | null {
  const b1 = bytes[at + 1] as number;
  if (bytes[at] !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const version = (b1 >> 3) & 3;
  const layerBits = (b1 >> 1) & 3;
  if (version === 1 || layerBits === 0) return null;
  const b2 = bytes[at + 2] as number;
  const bitrateIndex = b2 >> 4;
  const rateIndex = (b2 >> 2) & 3;
  if (bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  const layer = 4 - layerBits;
  const rate = (MPEG_RATES[version as 0 | 2 | 3] as readonly number[])[rateIndex] as number;
  const table: readonly number[] = version === 3 ? (MPEG1_BITRATES[layer - 1] as readonly number[]) : (MPEG2_BITRATES[layer === 1 ? 0 : 1] as readonly number[]);
  const bitrate = table[bitrateIndex] as number;
  const padding = (b2 >> 1) & 1;
  const samples = layer === 1 ? 384 : layer === 2 || version === 3 ? 1152 : 576;
  const length = layer === 1 ? (Math.floor((12 * bitrate * 1000) / rate) + padding) * 4 : Math.floor(((samples / 8) * bitrate * 1000) / rate) + padding;
  return { length, samples, rate, channels: (((bytes[at + 3] as number) >> 6) & 3) === 3 ? 1 : 2 };
}

/** Frame scan; the Xing/Info frame is not audio, and its LAME tag's encoder delay and padding are not played. */
export function mp3Header(bytes: Uint8Array): ProbeResult {
  let at = 0;
  if (ascii(bytes, 0, 3) === "ID3" && bytes.length >= 10) at = 10 + (((bytes[6] as number) & 0x7f) << 21 | ((bytes[7] as number) & 0x7f) << 14 | ((bytes[8] as number) & 0x7f) << 7 | ((bytes[9] as number) & 0x7f)) + ((bytes[5] as number) & 0x10 ? 10 : 0);
  let total = 0;
  let frames = 0;
  let first: Mp3Frame | null = null;
  let trim = 0;
  while (at + 4 <= bytes.length) {
    const frame = mp3Frame(bytes, at);
    if (!frame) {
      at++;
      continue;
    }
    if (!first) {
      first = frame;
      const head = ascii(bytes, at + 4, 40);
      const tag = Math.max(head.indexOf("Xing"), head.indexOf("Info"));
      if (tag >= 0) {
        const base = at + 4 + tag;
        const lame = ascii(bytes, base + 8, 140).indexOf("LAME");
        const flags = bytes[base + 7] as number;
        const start = base + 8 + (flags & 1 ? 4 : 0) + (flags & 2 ? 4 : 0) + (flags & 4 ? 100 : 0) + (flags & 8 ? 4 : 0);
        if (ascii(bytes, start, 4) === "LAME" || lame >= 0) {
          const delayAt = start + 21;
          const delay = ((bytes[delayAt] as number) << 4) | ((bytes[delayAt + 1] as number) >> 4);
          const padding = (((bytes[delayAt + 1] as number) & 0xf) << 8) | (bytes[delayAt + 2] as number);
          trim = delay + padding;
        }
        at += frame.length;
        continue;
      }
    }
    total += frame.samples;
    frames++;
    at += frame.length;
  }
  if (!first || frames === 0) throw bad("MP3");
  return { kind: "audio", durationUs: ticksToUs(Math.max(0, total - trim), first.rate), hasAudio: true, audioCodec: "mp3", audio: { channels: first.channels, sampleRate: first.rate } };
}

// --- OGG ----------------------------------------------------------------------------------------------

/** The identification packet in `head` and the last page's granule position in `tail`. */
export function oggHeader(head: Uint8Array, tail: Uint8Array): ProbeResult {
  if (ascii(head, 0, 4) !== "OggS") throw bad("Ogg");
  const payload = 27 + (head[26] as number);
  let channels = 0;
  let rate = 0;
  let skip = 0;
  let granuleRate = 0;
  if (ascii(head, payload, 7) === "\u0001vorbis") {
    channels = head[payload + 11] as number;
    rate = u32le(head, payload + 12);
    granuleRate = rate;
  } else if (ascii(head, payload, 8) === "OpusHead") {
    channels = head[payload + 9] as number;
    skip = u16le(head, payload + 10);
    rate = u32le(head, payload + 12);
    granuleRate = 48000;
  } else throw bad("Ogg");
  let last = -1;
  for (let at = tail.length - 27; at >= 0; at--) if (tail[at] === 0x4f && ascii(tail, at, 4) === "OggS") {
    last = at;
    break;
  }
  if (last < 0 || !(rate > 0)) throw bad("Ogg");
  const granule = u32le(tail, last + 6) + u32le(tail, last + 10) * 2 ** 32;
  return { kind: "audio", durationUs: ticksToUs(Math.max(0, granule - skip), granuleRate), hasAudio: true, audioCodec: "ogg", audio: { channels, sampleRate: rate } };
}

// --- Images -------------------------------------------------------------------------------------------

const still = (width: number, height: number, codec: string): ProbeResult => ({ kind: "image", durationUs: 0, width, height, hasAudio: false, codec });

export function pngHeader(bytes: Uint8Array): ProbeResult {
  if (bytes.length < 24 || ascii(bytes, 1, 3) !== "PNG" || ascii(bytes, 12, 4) !== "IHDR") throw bad("PNG");
  return still(u32be(bytes, 16), u32be(bytes, 20), "png");
}

/** The EXIF orientation of a JPEG (1 when it has none). */
function jpegOrientation(bytes: Uint8Array, at: number, end: number): number {
  if (ascii(bytes, at, 4) !== "Exif") return 1;
  const tiff = at + 6;
  const little = ascii(bytes, tiff, 2) === "II";
  const u16 = (p: number): number => (little ? u16le(bytes, p) : ((bytes[p] as number) << 8) | (bytes[p + 1] as number));
  const u32 = (p: number): number => (little ? u32le(bytes, p) : u32be(bytes, p));
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) return 1;
  for (let i = 0, n = u16(ifd); i < n && ifd + 2 + i * 12 + 12 <= end; i++) {
    const entry = ifd + 2 + i * 12;
    if (u16(entry) === 0x0112) return u16(entry + 8);
  }
  return 1;
}

export function jpegHeader(bytes: Uint8Array): ProbeResult {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw bad("JPEG");
  let orientation = 1;
  for (let at = 2; at + 4 <= bytes.length; ) {
    if (bytes[at] !== 0xff) throw bad("JPEG");
    const marker = bytes[at + 1] as number;
    if (marker === 0xff) {
      at++;
      continue;
    }
    const size = ((bytes[at + 2] as number) << 8) | (bytes[at + 3] as number);
    if (marker === 0xe1) orientation = jpegOrientation(bytes, at + 4, Math.min(bytes.length, at + 2 + size));
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const height = ((bytes[at + 5] as number) << 8) | (bytes[at + 6] as number);
      const width = ((bytes[at + 7] as number) << 8) | (bytes[at + 8] as number);
      if (!(width > 0 && height > 0)) throw bad("JPEG");
      // createImageBitmap (the app's probe) applies the EXIF orientation: 5-8 turn the picture a quarter.
      return orientation >= 5 && orientation <= 8 ? still(height, width, "jpeg") : still(width, height, "jpeg");
    }
    at += 2 + size;
  }
  throw bad("JPEG");
}

export function gifHeader(bytes: Uint8Array): ProbeResult {
  if (ascii(bytes, 0, 4) !== "GIF8" || bytes.length < 13) throw bad("GIF");
  const width = u16le(bytes, 6);
  const height = u16le(bytes, 8);
  let at = 13 + ((bytes[10] as number) & 0x80 ? 3 * 2 ** (((bytes[10] as number) & 7) + 1) : 0);
  const delays: number[] = [];
  let delay = 0;
  const skipBlocks = (): void => {
    while (at < bytes.length && bytes[at] !== 0) at += (bytes[at] as number) + 1;
    at++;
  };
  while (at < bytes.length && bytes[at] !== 0x3b) {
    if (bytes[at] === 0x21) {
      if (bytes[at + 1] === 0xf9) delay = u16le(bytes, at + 4) * 10_000;
      at += 2;
      skipBlocks();
    } else if (bytes[at] === 0x2c) {
      const flags = bytes[at + 9] as number;
      at += 10 + (flags & 0x80 ? 3 * 2 ** ((flags & 7) + 1) : 0) + 1;
      skipBlocks();
      delays.push(delay);
      delay = 0;
    } else throw bad("GIF");
  }
  if (!(width > 0 && height > 0)) throw bad("GIF");
  if (delays.length < 2) return still(width, height, "gif");
  return { ...still(width, height, "gif"), durationUs: delays.reduce((sum, us) => sum + frameDurationUs(us), 0) };
}

export function webpHeader(bytes: Uint8Array): ProbeResult {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") throw bad("WebP");
  let width = 0;
  let height = 0;
  let animated = false;
  let durationUs = 0;
  let frames = 0;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = ascii(bytes, at, 4);
    const size = u32le(bytes, at + 4);
    const body = at + 8;
    if (id === "VP8X") {
      animated = ((bytes[body] as number) & 2) !== 0;
      width = u24le(bytes, body + 4) + 1;
      height = u24le(bytes, body + 7) + 1;
    } else if (id === "VP8 " && width === 0) {
      width = u16le(bytes, body + 6) & 0x3fff;
      height = u16le(bytes, body + 8) & 0x3fff;
    } else if (id === "VP8L" && width === 0) {
      const bits = u32le(bytes, body + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    } else if (id === "ANMF") {
      frames++;
      durationUs += frameDurationUs(u24le(bytes, body + 12) * 1000);
    }
    at = body + size + (size % 2);
  }
  if (!(width > 0 && height > 0)) throw bad("WebP");
  if (animated && frames >= 2) return { ...still(width, height, "webp"), durationUs };
  return still(width, height, "webp");
}

/** The root element's size, read from its start tag (the app's own rule, `svgSizeFromAttributes`). */
export function svgHeader(text: string): ProbeResult {
  const tag = /<svg\b([^>]*)>/i.exec(text);
  if (!tag) throw bad("SVG");
  const attribute = (name: string): string | null => new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag[1] as string)?.slice(1).find((value) => value !== undefined) ?? null;
  const size = svgSizeFromAttributes({ width: attribute("width"), height: attribute("height"), viewBox: attribute("viewBox") });
  if (!size) throw new ProbeError("The SVG has no size (width/height or viewBox)");
  return still(size.width, size.height, "svg");
}

// --- Dispatch -----------------------------------------------------------------------------------------

/**
 * The header facts of a media file, by its name's extension (the app's own rule, `classifyFile`).
 * Throws a `ProbeError` when the type is unknown or the file cannot be read.
 */
export async function readMediaHeader(file: Blob, name: string): Promise<ProbeResult> {
  const kind = classifyFile(name, file.type);
  if (!kind) throw new ProbeError(`${name}: not a media type the editor imports`);
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  switch (kind.container) {
    case "mp4":
    case "webm":
      return probeVideoFile(file, undefined, kind.container);
    case "audio":
      if (ext === "wav") return wavHeader(await bytesOf(file));
      if (ext === "mp3") return mp3Header(await bytesOf(file));
      if (ext === "ogg") return oggHeader(await bytesOf(file, 0, 4096), await bytesOf(file, Math.max(0, file.size - 65_536)));
      throw new ProbeError(`no header reader for .${ext} files`);
    case "svg":
      return svgHeader(await file.text());
    case "lottie":
      return probeLottie(file);
    case "image": {
      const head = await bytesOf(file, 0, file.size > 4_000_000 ? 4_000_000 : file.size);
      if (ext === "png") return pngHeader(head);
      if (ext === "jpg" || ext === "jpeg") return jpegHeader(head);
      if (ext === "gif") return gifHeader(await bytesOf(file));
      return webpHeader(await bytesOf(file));
    }
  }
}
