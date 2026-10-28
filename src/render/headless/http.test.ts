import { describe, expect, it } from "vitest";
import { HttpDir, type FetchLike } from "./HttpDir.js";
import { HttpSink, putOutput } from "./HttpSink.js";

const files: Record<string, string> = { "/p/project.json": '{"a":1}', "/p/media/clip.bin": "0123456789" };

const fakeFetch: FetchLike = async (url, init) => {
  const { pathname, search } = new URL(url, "http://x");
  const path = decodeURIComponent(pathname);
  if (search === "?list") {
    const prefix = path.endsWith("/") ? path : `${path}/`;
    const names = new Map<string, "file" | "directory">();
    for (const key of Object.keys(files)) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      names.set(rest.split("/")[0] as string, rest.includes("/") ? "directory" : "file");
    }
    if (names.size === 0) return new Response("", { status: 404 });
    return Response.json([...names].map(([name, kind]) => ({ name, kind })));
  }
  const body = files[path];
  if (body === undefined) return new Response("", { status: 404 });
  const range = /bytes=(\d+)-(\d+)/.exec(init?.headers?.["range"] ?? "");
  if (range) return new Response(body.slice(Number(range[1]), Number(range[2]) + 1), { status: 206 });
  return new Response(body, { headers: { "last-modified": "Thu, 01 Jan 2026 00:00:00 GMT" } });
};

describe("HttpDir", () => {
  const dir = new HttpDir("/p/", "p", fakeFetch);

  it("reads text files with their time and answers null for a missing file", async () => {
    expect(await dir.readFile("project.json")).toEqual({ text: '{"a":1}', lastModified: Date.parse("2026-01-01T00:00:00Z") });
    expect(await dir.readFile("session.json")).toBeNull();
  });

  it("reads subfolders, lists them and reads byte ranges", async () => {
    const media = await dir.dir("media");
    expect(media).not.toBeNull();
    expect(await media!.list()).toEqual([{ name: "clip.bin", kind: "file" }]);
    expect(await dir.dir("fonts")).toBeNull();
    expect(new TextDecoder().decode((await (media as HttpDir).readRange("clip.bin", 2, 4))!)).toBe("2345");
    const file = await media!.getFile("clip.bin");
    expect(file?.name).toBe("clip.bin");
  });

  it("refuses every write and asks for no write permission", async () => {
    await expect(dir.writeText("a", "b")).rejects.toMatchObject({ name: "NotAllowedError" });
    await expect(dir.openWritable("a")).rejects.toMatchObject({ name: "NotAllowedError" });
    await expect(dir.remove("a")).rejects.toMatchObject({ name: "NotAllowedError" });
    await expect(dir.dir("x", { create: true })).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(await dir.queryPermission("read")).toBe("granted");
    expect(await dir.queryPermission("readwrite")).toBe("denied");
  });
});

describe("HttpSink", () => {
  it("sends bytes at their positions, then commits", async () => {
    const calls: string[] = [];
    const sink = new HttpSink("http://x/__t/1/", "a b.mp4", async (url, init) => {
      calls.push(`${init.method} ${url}`);
      return new Response("");
    });
    const writable = await sink.openWritable();
    await writable.write(new Uint8Array([1]), 0);
    await writable.write(new Uint8Array([2]), 4096);
    await writable.close();
    expect(calls).toEqual(["PUT http://x/__t/1/sink/a%20b.mp4?pos=0", "PUT http://x/__t/1/sink/a%20b.mp4?pos=4096", "POST http://x/__t/1/sink/a%20b.mp4?op=close"]);
  });

  it("reports a refused write and aborts on remove", async () => {
    const calls: string[] = [];
    const sink = new HttpSink("/b/", "x.mp4", async (url, init) => {
      calls.push(`${init.method} ${url}`);
      return new Response("no space", { status: 507 });
    });
    const writable = await sink.openWritable();
    await expect(writable.write(new Uint8Array(1), 0)).rejects.toThrow(/507 no space/);
    await sink.remove();
    expect(calls.at(-1)).toBe("POST /b/sink/x.mp4?op=abort");
  });

  it("uploads small outputs by path", async () => {
    let seen = "";
    await putOutput("/b/", "frames/f 1.png", new Uint8Array(2), async (url) => ((seen = url), new Response("")));
    expect(seen).toBe("/b/out/frames/f%201.png");
  });
});
