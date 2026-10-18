// Names of a font file (spec §20.1 My fonts: "family and style names come from the font's `name` table
// (own small parser for TTF/OTF/WOFF)"): the format from the file's signature, the `name` table's
// family, style, full and PostScript names (the typographic family and style when the font has them,
// Windows English names first), and the weight and italic of `OS/2` (else read from the style name).
// WOFF tables are zlib streams, inflated with `DecompressionStream`. WOFF2 (Brotli with transformed
// tables) is not read: its names come from the file name (`namesFromFileName`), which can be renamed.
// Pure (async only for the inflate).
import { parseFaceStyle } from "../fonts.js";

export type FontFormat = "ttf" | "otf" | "ttc" | "woff" | "woff2";

/** The extensions My fonts accepts. */
export const FONT_EXTENSIONS = [".ttf", ".otf", ".woff", ".woff2"] as const;

export interface FontNames {
  family: string;
  /** The style name: "Bold Italic", "Regular". */
  style: string;
  fullName: string;
  postscriptName: string;
  weight: number;
  italic: boolean;
  /** Where the names came from: the font's `name` table, or the file name. */
  from: "name" | "file";
}

const tag = (bytes: Uint8Array, at: number) => String.fromCharCode(bytes[at] ?? 0, bytes[at + 1] ?? 0, bytes[at + 2] ?? 0, bytes[at + 3] ?? 0);

/** The format of a font file from its first 4 bytes, or null when it is not one of the formats. */
export function fontFormat(bytes: Uint8Array): FontFormat | null {
  if (bytes.length < 4) return null;
  const signature = tag(bytes, 0);
  if (signature === "OTTO") return "otf";
  if (signature === "ttcf") return "ttc";
  if (signature === "wOFF") return "woff";
  if (signature === "wOF2") return "woff2";
  if (signature === "true" || (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0)) return "ttf";
  return null;
}

/** Whether a file name has one of the accepted extensions. */
export const isFontFileName = (name: string): boolean => FONT_EXTENSIONS.some((extension) => name.toLowerCase().endsWith(extension));

interface Table {
  offset: number;
  length: number;
}

/** The tables of the sfnt at `start` (the first font of a collection), by tag. */
function sfntTables(view: DataView, start: number): Map<string, Table> | null {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  if (start + 12 > view.byteLength) return null;
  const count = view.getUint16(start + 4);
  if (start + 12 + count * 16 > view.byteLength) return null;
  const tables = new Map<string, Table>();
  for (let i = 0; i < count; i += 1) {
    const at = start + 12 + i * 16;
    const offset = view.getUint32(at + 8);
    const length = view.getUint32(at + 12);
    if (offset + length <= view.byteLength) tables.set(tag(bytes, at), { offset, length });
  }
  return tables;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  // A one-chunk stream (jsdom's Blob has no stream()).
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const stream = source.pipeThrough(new DecompressionStream("deflate") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The `name` and `OS/2` tables of a font file as their own views, or null. */
async function namedTables(data: ArrayBuffer): Promise<{ name: DataView; os2: DataView | null } | null> {
  const bytes = new Uint8Array(data);
  const format = fontFormat(bytes);
  const view = new DataView(data);
  if (format === "ttf" || format === "otf" || format === "ttc") {
    const start = format === "ttc" ? (view.byteLength >= 16 && view.getUint32(8) > 0 ? view.getUint32(12) : -1) : 0;
    if (start < 0) return null;
    const tables = sfntTables(view, start);
    const name = tables?.get("name");
    if (!tables || !name) return null;
    const os2 = tables.get("OS/2");
    return { name: new DataView(data, name.offset, name.length), os2: os2 ? new DataView(data, os2.offset, os2.length) : null };
  }
  if (format === "woff") {
    if (view.byteLength < 44) return null;
    const count = view.getUint16(12);
    const found = new Map<string, DataView>();
    for (let i = 0; i < count; i += 1) {
      const at = 44 + i * 20;
      if (at + 20 > view.byteLength) return null;
      const which = tag(bytes, at);
      if (which !== "name" && which !== "OS/2") continue;
      const offset = view.getUint32(at + 4);
      const compLength = view.getUint32(at + 8);
      const origLength = view.getUint32(at + 12);
      if (offset + compLength > view.byteLength) return null;
      const raw = bytes.subarray(offset, offset + compLength);
      const table = compLength < origLength ? await inflate(raw) : raw.slice();
      found.set(which, new DataView(table.buffer, table.byteOffset, table.byteLength));
    }
    const name = found.get("name");
    return name ? { name, os2: found.get("OS/2") ?? null } : null;
  }
  return null;
}

const NAME_IDS = { family: 1, style: 2, fullName: 4, postscript: 6, typographicFamily: 16, typographicStyle: 17 } as const;

/** Mac Roman's upper half is close enough to Latin-1 for family names; the rest is ASCII. */
const decodeMac = (bytes: Uint8Array) => String.fromCharCode(...bytes);

function decodeUtf16(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) out += String.fromCharCode(((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0));
  return out;
}

/** The names of a `name` table by id: Windows (US English first), then Unicode, then Mac Roman records. */
function readNames(table: DataView): Map<number, string> {
  const bytes = new Uint8Array(table.buffer, table.byteOffset, table.byteLength);
  if (table.byteLength < 6) return new Map();
  const count = table.getUint16(2);
  const strings = table.getUint16(4);
  const best = new Map<number, { rank: number; text: string }>();
  for (let i = 0; i < count; i += 1) {
    const at = 6 + i * 12;
    if (at + 12 > table.byteLength) break;
    const platform = table.getUint16(at);
    const encoding = table.getUint16(at + 2);
    const language = table.getUint16(at + 4);
    const id = table.getUint16(at + 6);
    const length = table.getUint16(at + 8);
    const offset = strings + table.getUint16(at + 10);
    if (offset + length > table.byteLength) continue;
    const raw = bytes.subarray(offset, offset + length);
    let rank: number;
    let text: string;
    if (platform === 3 && (encoding === 1 || encoding === 10 || encoding === 0)) {
      rank = language === 0x0409 ? 0 : 1;
      text = decodeUtf16(raw);
    } else if (platform === 0) {
      rank = 2;
      text = decodeUtf16(raw);
    } else if (platform === 1 && encoding === 0) {
      rank = language === 0 ? 3 : 4;
      text = decodeMac(raw);
    } else continue;
    text = text.replace(/\0/g, "").trim();
    if (text === "") continue;
    const known = best.get(id);
    if (!known || rank < known.rank) best.set(id, { rank, text });
  }
  return new Map([...best].map(([id, entry]) => [id, entry.text]));
}

/** Weight and italic from `OS/2` (usWeightClass, fsSelection), when the table has them. */
function os2Style(table: DataView | null): { weight: number | null; italic: boolean | null } {
  if (!table || table.byteLength < 64) return { weight: table && table.byteLength >= 6 ? weightClass(table.getUint16(4)) : null, italic: null };
  const selection = table.getUint16(62);
  return { weight: weightClass(table.getUint16(4)), italic: (selection & 0x1) !== 0 || (selection & 0x200) !== 0 };
}

/** usWeightClass as a CSS weight: old fonts use 1-9 for 100-900; out of range reads as unknown. */
function weightClass(value: number): number | null {
  if (value >= 1 && value <= 9) return value * 100;
  return value >= 1 && value <= 1000 ? value : null;
}

/** The names of a TTF, OTF, TTC (its first font) or WOFF file, or null (WOFF2, not a font, no `name` table). */
export async function readFontNames(data: ArrayBuffer): Promise<FontNames | null> {
  let tables: Awaited<ReturnType<typeof namedTables>>;
  try {
    tables = await namedTables(data);
  } catch {
    return null;
  }
  if (!tables) return null;
  const names = readNames(tables.name);
  const family = names.get(NAME_IDS.typographicFamily) ?? names.get(NAME_IDS.family);
  if (!family) return null;
  const style = names.get(NAME_IDS.typographicStyle) ?? names.get(NAME_IDS.style) ?? "Regular";
  const parsed = parseFaceStyle(style);
  const os2 = os2Style(tables.os2);
  return {
    family,
    style,
    fullName: names.get(NAME_IDS.fullName) ?? `${family} ${style}`,
    postscriptName: names.get(NAME_IDS.postscript) ?? `${family}-${style}`.replace(/\s+/g, ""),
    weight: os2.weight ?? parsed.weight,
    italic: os2.italic ?? parsed.italic,
    from: "name",
  };
}

const STYLE_WORDS = /^(thin|hairline|extra|ultra|semi|demi|light|regular|normal|book|roman|medium|bold|black|heavy|italic|oblique)+$/i;

/** Splits "BoldItalic" / "SemiBold" into words. */
const splitCamel = (text: string) => text.replace(/([a-z])([A-Z])/g, "$1 $2");

/**
 * The names a file name gives (WOFF2, or a file whose names cannot be read): "Montserrat-BoldItalic.woff2"
 * is Montserrat, "Bold Italic"; a name without a style part is the family, Regular.
 */
export function namesFromFileName(fileName: string): FontNames {
  const stem = fileName.replace(/\.[^.]*$/, "").trim() || fileName;
  const cut = Math.max(stem.lastIndexOf("-"), stem.lastIndexOf("_"));
  const tail = cut > 0 ? stem.slice(cut + 1) : "";
  const hasStyle = tail !== "" && STYLE_WORDS.test(tail.replace(/[\s-]/g, ""));
  const family = (hasStyle ? stem.slice(0, cut) : stem).replace(/_+/g, " ").replace(/\s+/g, " ").trim() || stem;
  const style = hasStyle ? splitCamel(tail).replace(/\s+/g, " ").trim() : "Regular";
  const { weight, italic } = parseFaceStyle(style);
  const cased = style.replace(/\b\w/g, (c) => c.toUpperCase());
  return { family, style: cased, fullName: `${family} ${cased}`, postscriptName: `${family}-${cased}`.replace(/\s+/g, ""), weight, italic, from: "file" };
}
