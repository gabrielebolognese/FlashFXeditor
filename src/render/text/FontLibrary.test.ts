import { describe, expect, it } from "vitest";
import { parseCatalog } from "../../text/fonts/catalog.js";
import { userFamilies, type UserFont } from "../../text/fonts/userFonts.js";
import { FontLibrary, type FontChange } from "./FontLibrary.js";

/** A FontFaceSet stand-in: faces by family; `check` is true when every face of the family is loaded. */
function fakeFontSet() {
  const faces = new Set<{ family: string; status: string }>();
  const set = {
    faces,
    add: (face: { family: string; status: string }) => void faces.add(face),
    delete: (face: { family: string; status: string }) => faces.delete(face),
    check: (font: string) => {
      const family = /"((?:[^"\\]|\\.)*)"/.exec(font)?.[1] ?? "";
      return [...faces].filter((face) => face.family === family).every((face) => face.status === "loaded");
    },
    load: async () => [],
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  return set;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup() {
  const fonts = fakeFontSet();
  const fetched: string[] = [];
  const fetch = async (url: RequestInfo | URL) => {
    fetched.push(String(url));
    return new Response(new Uint8Array([1, 2, 3]));
  };
  const made: { family: string; descriptors: FontFaceDescriptors }[] = [];
  const makeFace = (family: string, _data: ArrayBuffer, descriptors: FontFaceDescriptors) => {
    made.push({ family, descriptors });
    const face = { family, status: "unloaded", load: async () => ((face.status = "loaded"), face) };
    return face as unknown as FontFace;
  };
  const library = new FontLibrary(fonts as unknown as FontFaceSet, { baseUrl: "https://app.test/sub/", fetch: fetch as typeof globalThis.fetch, makeFace });
  const changes: FontChange[] = [];
  library.subscribe((change) => changes.push(change));
  return { fonts, fetched, made, library, changes };
}

const anton = {
  family: "Anton",
  slug: "anton",
  categories: ["bold"],
  weights: [400],
  files: [
    { subset: "latin", weight: 400, style: "normal", path: "anton/anton-latin-400-normal.woff2", bytes: 3 },
    { subset: "latin-ext", weight: 400, style: "normal", path: "anton/anton-latin-ext-400-normal.woff2", bytes: 3 },
  ],
  license: "OFL-1.1",
  designer: "Vernon Adams",
};
const catalog = parseCatalog({ subsets: { latin: "U+0000-00FF", "latin-ext": "U+0100-024F" }, families: [anton] });

const userFace = (id: string, family: string, weight: number): UserFont => ({
  id,
  family,
  style: "Regular",
  weight,
  italic: false,
  postscriptName: id,
  fileName: `${id}.ttf`,
  format: "ttf",
  bytes: 3,
  from: "name",
  categories: [],
  tags: [],
  addedAt: "t",
  updatedAt: "t",
});

describe("FontLibrary sources (spec §20.1)", () => {
  it("tells the library (core and catalog), My fonts and the project's fonts apart", async () => {
    const { library, changes } = setup();
    expect(library.source("Inter")).toBe("library");
    expect(library.libraryFamily("anton")).toBeNull();
    library.setCatalog(catalog);
    expect(library.source("anton")).toBe("library");
    expect(changes.at(-1)).toEqual({ families: new Set(["anton"]), redraw: true });
    library.setUserFonts(userFamilies([userFace("u1", "Brand", 700)]), async () => new ArrayBuffer(3));
    expect(library.source("BRAND")).toBe("user");
    expect(changes.at(-1)).toEqual({ families: new Set(["brand"]), redraw: true });
    await library.setProjectFaces([{ family: "Copied", weight: 400, italic: false, data: new ArrayBuffer(3) }]);
    expect(library.source("Copied")).toBe("project");
    expect(library.hasProjectFamily("copied")).toBe(true);
  });
});

describe("FontLibrary loads", () => {
  it("fetches a library face's files (every subset) when text needs it, then reports the family", async () => {
    const { library, fetched, made, changes } = setup();
    library.setCatalog(catalog);
    changes.length = 0;
    const style = { fontFamily: "Anton", fontWeight: 400, italic: false };
    expect(library.ready(style, "Hello")).toBe(false);
    await library.load(style, "Hello");
    expect(fetched).toEqual(["https://app.test/sub/fonts/library/anton/anton-latin-400-normal.woff2", "https://app.test/sub/fonts/library/anton/anton-latin-ext-400-normal.woff2"]);
    expect(made.map((face) => face.descriptors)).toEqual([
      { weight: "400", style: "normal", display: "block", unicodeRange: "U+0000-00FF" },
      { weight: "400", style: "normal", display: "block", unicodeRange: "U+0100-024F" },
    ]);
    expect(changes).toEqual([{ families: new Set(["anton"]), redraw: false }]);
    expect(library.ready(style, "Hello")).toBe(true);
    expect(library.loadStats()).toMatchObject({ loaded: 2, inFlight: 0 });
  });

  it("loads a browser row's latin file through the queue, reports nothing, and can cancel it", async () => {
    const { library, fetched, changes } = setup();
    library.setCatalog(catalog);
    changes.length = 0;
    expect(library.previewReady("Anton", 400)).toBe(false);
    const ticket = library.preview("Anton", 400);
    expect(await ticket?.done).toBe(true);
    expect(fetched).toEqual(["https://app.test/sub/fonts/library/anton/anton-latin-400-normal.woff2"]);
    expect(library.previewReady("Anton", 400)).toBe(true);
    expect(library.preview("Anton", 400)).toBeNull();
    expect(changes).toEqual([]);
    // A system or unknown family has nothing to load.
    expect(library.preview("Segoe UI", 400)).toBeNull();
  });

  it("reads a My fonts face when needed, and drops it when the family is renamed", async () => {
    const { library, fonts } = setup();
    const reads: string[] = [];
    const read = async (font: UserFont) => {
      reads.push(font.id);
      return new ArrayBuffer(3);
    };
    library.setUserFonts(userFamilies([userFace("u1", "Brand", 400), userFace("u2", "Brand", 700)]), read);
    const style = { fontFamily: "Brand", fontWeight: 650, italic: false };
    expect(library.ready(style, "x")).toBe(false);
    await library.load(style, "x");
    expect(reads).toEqual(["u2"]);
    expect([...fonts.faces].map((face) => face.family)).toEqual(["Brand"]);
    library.setUserFonts(userFamilies([{ ...userFace("u1", "Brand Pro", 400) }, { ...userFace("u2", "Brand Pro", 700) }]), read);
    expect([...fonts.faces]).toEqual([]);
    expect(library.source("Brand")).not.toBe("user");
    expect(library.userFace("Brand Pro", 700, false)?.id).toBe("u2");
    await flush();
  });

  it("hands workers a library style's files by URL, and adds what it is handed", async () => {
    const { library } = setup();
    expect(library.libraryDescriptors({ fontFamily: "Anton", fontWeight: 400, italic: false })).toEqual([]);
    library.setCatalog(catalog);
    expect(library.libraryDescriptors({ fontFamily: "Anton", fontWeight: 900, italic: true })).toEqual([
      { family: "Anton", url: "https://app.test/sub/fonts/library/anton/anton-latin-400-normal.woff2", weight: "400", style: "normal", unicodeRange: "U+0000-00FF" },
      { family: "Anton", url: "https://app.test/sub/fonts/library/anton/anton-latin-ext-400-normal.woff2", weight: "400", style: "normal", unicodeRange: "U+0100-024F" },
    ]);
    // The core fonts are the worker's own.
    expect(library.libraryDescriptors({ fontFamily: "Inter", fontWeight: 400, italic: false })).toEqual([]);
    const worker = setup();
    await worker.library.addDescriptors([{ family: "Brand", data: new ArrayBuffer(3), weight: "700", style: "normal" }]);
    expect([...worker.fonts.faces].map((face) => [face.family, face.status])).toEqual([["Brand", "loaded"]]);
    worker.library.clearDescriptors();
    expect(worker.fonts.faces.size).toBe(0);
  });
});
