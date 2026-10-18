// Test-only font files (Batch 51): a minimal sfnt (TTF or OTF signature, a `name` table with the given
// records and an optional `OS/2`), a TrueType collection around it, and WOFF 1.0 wrappers with the
// tables zlib-compressed (`CompressionStream`) or stored. Not loadable fonts (no glyphs): what the
// `name` table parser reads.

export interface NameRecord {
  id: number;
  text: string;
  /** 3 Windows (UTF-16BE, default), 0 Unicode, 1 Mac Roman. */
  platform?: 0 | 1 | 3;
  language?: number;
}

export interface TestFont {
  flavor?: "ttf" | "otf";
  names: readonly NameRecord[];
  /** OS/2 usWeightClass and fsSelection; no OS/2 table when absent. */
  os2?: { weightClass: number; selection: number };
}

const encode = (record: NameRecord): Uint8Array => {
  if ((record.platform ?? 3) === 1) return Uint8Array.from(record.text, (c) => c.charCodeAt(0) & 0xff);
  const out = new Uint8Array(record.text.length * 2);
  for (let i = 0; i < record.text.length; i += 1) {
    const code = record.text.charCodeAt(i);
    out[i * 2] = code >> 8;
    out[i * 2 + 1] = code & 0xff;
  }
  return out;
};

function nameTable(records: readonly NameRecord[]): Uint8Array {
  const strings = records.map(encode);
  const header = 6 + records.length * 12;
  const size = header + strings.reduce((n, s) => n + s.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0);
  view.setUint16(2, records.length);
  view.setUint16(4, header);
  let offset = 0;
  records.forEach((record, i) => {
    const platform = record.platform ?? 3;
    const at = 6 + i * 12;
    view.setUint16(at, platform);
    view.setUint16(at + 2, platform === 3 ? 1 : platform === 0 ? 3 : 0);
    view.setUint16(at + 4, record.language ?? (platform === 3 ? 0x0409 : 0));
    view.setUint16(at + 6, record.id);
    const bytes = strings[i] as Uint8Array;
    view.setUint16(at + 8, bytes.length);
    view.setUint16(at + 10, offset);
    out.set(bytes, header + offset);
    offset += bytes.length;
  });
  return out;
}

function os2Table(weightClass: number, selection: number): Uint8Array {
  const out = new Uint8Array(78);
  const view = new DataView(out.buffer);
  view.setUint16(0, 3);
  view.setUint16(4, weightClass);
  view.setUint16(62, selection);
  return out;
}

function tablesOf(font: TestFont): [string, Uint8Array][] {
  const tables: [string, Uint8Array][] = [["name", nameTable(font.names)]];
  if (font.os2) tables.unshift(["OS/2", os2Table(font.os2.weightClass, font.os2.selection)]);
  // A dummy head table, so the name table is not the first one.
  tables.unshift(["head", new Uint8Array(54)]);
  return tables;
}

const pad4 = (n: number) => (n + 3) & ~3;

function writeTag(view: DataView, at: number, text: string): void {
  for (let i = 0; i < 4; i += 1) view.setUint8(at + i, text.charCodeAt(i));
}

/** An sfnt (TTF or OTF) with the font's tables, placed at `base` in the file (for collections). */
export function makeSfnt(font: TestFont, base = 0): Uint8Array {
  const tables = tablesOf(font);
  const directory = 12 + tables.length * 16;
  const size = directory + tables.reduce((n, [, data]) => n + pad4(data.length), 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  if (font.flavor === "otf") writeTag(view, 0, "OTTO");
  else view.setUint32(0, 0x00010000);
  view.setUint16(4, tables.length);
  let offset = directory;
  tables.forEach(([name, data], i) => {
    const at = 12 + i * 16;
    writeTag(view, at, name);
    view.setUint32(at + 8, base + offset);
    view.setUint32(at + 12, data.length);
    out.set(data, offset);
    offset += pad4(data.length);
  });
  return out;
}

/** A TrueType collection holding the font (its offsets point past the collection header). */
export function makeTtc(font: TestFont): Uint8Array {
  const header = 16;
  const sfnt = makeSfnt(font, header);
  const out = new Uint8Array(header + sfnt.length);
  const view = new DataView(out.buffer);
  writeTag(view, 0, "ttcf");
  view.setUint32(4, 0x00010000);
  view.setUint32(8, 1);
  view.setUint32(12, header);
  out.set(sfnt, header);
  return out;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  // A one-chunk stream (jsdom's Blob has no stream()).
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  });
  const stream = source.pipeThrough(new CompressionStream("deflate") as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** A WOFF 1.0 file of the font, its tables compressed (when that makes them smaller) or stored. */
export async function makeWoff(font: TestFont, compress: boolean): Promise<Uint8Array> {
  const tables = tablesOf(font);
  const stored = await Promise.all(tables.map(async ([, data]) => (compress ? await deflate(data) : data)));
  const directory = 44 + tables.length * 20;
  const size = directory + stored.reduce((n, data) => n + pad4(data.length), 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  writeTag(view, 0, "wOFF");
  if (font.flavor === "otf") writeTag(view, 4, "OTTO");
  else view.setUint32(4, 0x00010000);
  view.setUint32(8, size);
  view.setUint16(12, tables.length);
  let offset = directory;
  tables.forEach(([name, data], i) => {
    const body = stored[i] as Uint8Array;
    const smaller = body.length < data.length;
    const at = 44 + i * 20;
    writeTag(view, at, name);
    view.setUint32(at + 4, offset);
    view.setUint32(at + 8, smaller ? body.length : data.length);
    view.setUint32(at + 12, data.length);
    out.set(smaller ? body : data, offset);
    offset += pad4(smaller ? body.length : data.length);
  });
  return out;
}

/** A WOFF2 file's signature and nothing the parser could read. */
export function makeWoff2Stub(): Uint8Array {
  const out = new Uint8Array(48);
  writeTag(new DataView(out.buffer), 0, "wOF2");
  return out;
}

export const bufferOf = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
