import { describe, expect, it } from "vitest";
import { makeMedia, makeProject } from "../core/document/fixtures.js";
import { buildTemplatesFixture } from "../core/document/templatesFixture.js";
import type { Sequence } from "../core/document/types.js";
import { collectBundle, compoundTemplate, MAX_COMPOUND_TEMPLATES, type CompoundTemplate } from "./compoundTemplates.js";
import { CompoundTemplateStore, emptyFiles, readTemplateFolder, removeTemplateFolder, writeTemplateFolder, type TemplateFiles } from "./compoundTemplateStore.js";
import type { KeyValueStore } from "./kv.js";
import { createMemoryDir } from "./memoryFs.js";

class MemoryKv implements KeyValueStore {
  readonly map = new Map<string, unknown>();
  async get(key: string) {
    return structuredClone(this.map.get(key));
  }
  async set(key: string, value: unknown) {
    this.map.set(key, structuredClone(value));
  }
  async del(key: string) {
    this.map.delete(key);
  }
}

const NOW = "2026-11-09T10:00:00.000Z";

function record(id: string, name = "Paper card"): CompoundTemplate {
  const project = buildTemplatesFixture(true);
  const bundle = collectBundle(project, "paper-card") as NonNullable<ReturnType<typeof collectBundle>>;
  bundle.media.pic = makeMedia("pic", "image", 0);
  return compoundTemplate(bundle, { id, name, category: "Cards", now: NOW, thumbnail: "data:image/png;base64,AAAA" });
}

const files = (): TemplateFiles => ({ media: { pic: { name: "pic.png", blob: new Blob(["png"]) } }, fonts: [{ name: "Face.ttf", blob: new Blob(["ttf"]) }] });

describe("the global store (IndexedDB)", () => {
  it("keeps templates newest first with their files, across a reload", async () => {
    const kv = new MemoryKv();
    const store = new CompoundTemplateStore(kv);
    await store.add(record("a"), files());
    await store.add(record("b", "Second"), emptyFiles());
    expect(store.list.getState().map((t) => t.id)).toEqual(["b", "a"]);
    const again = new CompoundTemplateStore(kv);
    await again.load();
    expect(again.list.getState().map((t) => [t.id, t.name])).toEqual([["b", "Second"], ["a", "Paper card"]]);
    expect(Object.keys((await again.files("a")).media)).toEqual(["pic"]);
    expect((await again.files("b")).fonts).toEqual([]);
    expect((await again.files("nope")).media).toEqual({});
  });

  it("replaces by id, renames, removes with the files, and caps the list", async () => {
    const kv = new MemoryKv();
    const store = new CompoundTemplateStore(kv);
    await store.add(record("a"), files());
    await store.add(record("a", "Renamed on save"), files());
    expect(store.list.getState()).toHaveLength(1);
    await store.update("a", { name: "Card", category: "Overlays" });
    expect(store.list.getState()[0]).toMatchObject({ name: "Card", category: "Overlays" });
    await store.remove("a");
    expect(store.list.getState()).toEqual([]);
    expect([...kv.map.keys()].filter((key) => key.includes(":a"))).toEqual([]);
    for (let i = 0; i < MAX_COMPOUND_TEMPLATES + 3; i++) await store.add(record(`t${i}`), emptyFiles());
    expect(store.list.getState()).toHaveLength(MAX_COMPOUND_TEMPLATES);
    expect(store.list.getState()[0]?.id).toBe(`t${MAX_COMPOUND_TEMPLATES + 2}`);
  });

  it("drops stored records that are not sound", async () => {
    const kv = new MemoryKv();
    const broken = structuredClone(record("bad"));
    delete (broken.bundle.sequences["paper-card"] as Sequence).params;
    kv.map.set("compoundTemplates.v1", [record("ok"), broken, 5, null]);
    const store = new CompoundTemplateStore(kv);
    await store.load();
    expect(store.list.getState().map((t) => t.id)).toEqual(["ok"]);
  });
});

describe("the library folder", () => {
  it("writes one folder per template and reads it back with its media and fonts", async () => {
    const library = createMemoryDir();
    await writeTemplateFolder(library, record("a"), files());
    const names = (await (await library.dir("templates", { create: false }))!.list()).map((e) => e.name);
    expect(names).toEqual(["a"]);
    const read = await readTemplateFolder(library, NOW);
    expect(read.skipped).toBe(0);
    expect(read.templates).toHaveLength(1);
    expect(read.templates[0]?.record).toEqual(record("a"));
    expect(Object.keys(read.templates[0]?.files.media ?? {})).toEqual(["pic"]);
    expect(await read.templates[0]?.files.media.pic?.blob.text()).toBe("png");
    expect(read.templates[0]?.files.fonts.map((f) => f.name)).toEqual(["Face.ttf"]);
  });

  it("removes a template's folder contents, and skips folders that are not templates", async () => {
    const library = createMemoryDir();
    await writeTemplateFolder(library, record("a"), files());
    await writeTemplateFolder(library, record("b"), emptyFiles());
    const templates = (await library.dir("templates", { create: false }))!;
    const junk = (await templates.dir("junk", { create: true }))!;
    await junk.writeText("template.json", "{ not json");
    await removeTemplateFolder(library, "a");
    const read = await readTemplateFolder(library, NOW);
    expect(read.templates.map((t) => t.record.id)).toEqual(["b"]);
    expect(read.skipped).toBe(1);
    await removeTemplateFolder(library, "missing");
  });

  it("an empty library has no templates", async () => {
    expect(await readTemplateFolder(createMemoryDir(), NOW)).toEqual({ templates: [], skipped: 0 });
    void makeProject;
  });
});
