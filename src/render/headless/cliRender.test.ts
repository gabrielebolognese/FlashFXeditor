// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findChrome, insideRoot, parseRange, PROFILE_PREFIX, RESERVED_PORTS, startServer, type RunServer } from "../../../scripts/cli/headless.js";
import { formatOf, judge, parseArgs, parseFrameList, parseFrameRange } from "../../../scripts/cli/render.js";
import type { CompareReport } from "./compareFrames.js";

describe("render and compare arguments", () => {
  it("splits positionals, valued options and flags", () => {
    const parsed = parseArgs(["fixtures/a", "--out", "out/a.mp4", "--json", "--backend", "webgl2"]);
    expect(parsed.positional).toEqual(["fixtures/a"]);
    expect(parsed.options.get("--out")).toBe("out/a.mp4");
    expect(parsed.options.get("--backend")).toBe("webgl2");
    expect(parsed.flags.has("--json")).toBe(true);
    expect(parsed.error).toBeUndefined();
  });

  it("refuses unknown options and options without a value", () => {
    expect(parseArgs(["--nope"]).error).toMatch(/Unknown option --nope/);
    expect(parseArgs(["--out"]).error).toMatch(/needs a value/);
    expect(parseArgs(["--out", "--json"]).error).toMatch(/needs a value/);
  });

  it("parses frame ranges and lists", () => {
    expect(parseFrameRange("10:40")).toEqual({ start: 10, end: 40 });
    expect(parseFrameRange("40:10")).toBeNull();
    expect(parseFrameRange("a:b")).toBeNull();
    expect(parseFrameList("0,45,89")).toEqual([0, 45, 89]);
    expect(parseFrameList("3, 3,4")).toEqual([3, 4]);
    expect(parseFrameList("1,x")).toBeNull();
    expect(parseFrameList("-1")).toBeNull();
  });

  it("judges a comparison by its thresholds, unmatched frames and emptiness", () => {
    const frame = (n: number, ssim: number, psnr = 50) => ({ frame: n, ssim, psnr, region: null });
    const report = (frames: ReturnType<typeof frame>[], unmatched: number[] = []): CompareReport => ({
      a: { kind: "video", frames: frames.length },
      b: { kind: "video", frames: frames.length },
      compared: frames.length,
      min: { ssim: 1, psnr: 1 },
      mean: { ssim: 1 },
      worst: [],
      unmatched,
      frames,
    });
    expect(judge(report([frame(0, 1), frame(1, 0.995)]), 0.99, null).ok).toBe(true);
    expect(judge(report([frame(0, 1), frame(1, 0.98)]), 0.99, null).failing.map((f) => f.frame)).toEqual([1]);
    expect(judge(report([frame(0, 1, 20)]), 0.99, 30).ok).toBe(false);
    expect(judge(report([frame(0, 1)], [5]), 0.99, null).ok).toBe(false);
    expect(judge(report([]), 0.99, null).ok).toBe(false);
  });
});

describe("headless helpers", () => {
  it("finds Chrome from CHROME_PATH first, then the usual places, else null", () => {
    expect(findChrome({ CHROME_PATH: "/x/chrome" }, (p) => p === "/x/chrome")).toBe("/x/chrome");
    expect(findChrome({}, (p) => p === "/usr/bin/chromium")).toBe("/usr/bin/chromium");
    expect(findChrome({}, () => false)).toBeNull();
  });

  it("keeps paths inside their root", () => {
    const root = join(tmpdir(), "root");
    expect(insideRoot(root, "a/b.json")).toBe(join(root, "a", "b.json"));
    expect(insideRoot(root, "../secret")).toBeNull();
    expect(insideRoot(root, "a/../../secret")).toBeNull();
  });

  it("parses byte ranges", () => {
    expect(parseRange(undefined, 10)).toBeNull();
    expect(parseRange("bytes=2-5", 10)).toEqual({ start: 2, end: 5 });
    expect(parseRange("bytes=2-", 10)).toEqual({ start: 2, end: 9 });
    expect(parseRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
    expect(parseRange("bytes=2-99", 10)).toEqual({ start: 2, end: 9 });
    expect(parseRange("bytes=20-30", 10)).toBe("bad");
    expect(parseRange("nonsense", 10)).toBe("bad");
  });

  it("names its profile folders and avoids the ports of other tools", () => {
    expect(PROFILE_PREFIX).toBe("shorts-editor-render-");
    expect(RESERVED_PORTS).toEqual([5300, 5310]);
  });
});

describe("render server", () => {
  const temp = mkdtempSync(join(tmpdir(), "render-server-test-"));
  const servers: RunServer[] = [];
  afterEach(async () => {
    for (const server of servers.splice(0)) await server.close();
  });

  const setup = async () => {
    const dist = join(temp, "dist");
    const project = join(temp, "project");
    mkdirSync(join(project, "media"), { recursive: true });
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, "index.html"), "<!doctype html>app");
    writeFileSync(join(project, "project.json"), '{"a":1}');
    writeFileSync(join(project, "media", "clip.bin"), "0123456789");
    writeFileSync(join(temp, "secret.txt"), "no");
    const out = join(temp, "out");
    const sinkFile = join(temp, "out.mp4");
    const server = await startServer({ dist, project, out, sinkFile });
    servers.push(server);
    return { server, base: `http://127.0.0.1:${server.port}/__t/${server.token}/`, out, sinkFile, origin: `http://127.0.0.1:${server.port}` };
  };

  it("serves the app, falls back to index.html, and listens outside 5300 and 5310", async () => {
    const { server, origin } = await setup();
    expect(RESERVED_PORTS).not.toContain(server.port);
    expect(await (await fetch(`${origin}/`)).text()).toBe("<!doctype html>app");
    expect(await (await fetch(`${origin}/some/route`)).text()).toBe("<!doctype html>app");
  });

  it("serves the project read-only with ranges, lists and no way out of the folder", async () => {
    const { base } = await setup();
    expect(await (await fetch(`${base}project/project.json`)).text()).toBe('{"a":1}');
    const part = await fetch(`${base}project/media/clip.bin`, { headers: { range: "bytes=2-5" } });
    expect(part.status).toBe(206);
    expect(await part.text()).toBe("2345");
    expect((await fetch(`${base}project/nope.json`)).status).toBe(404);
    const list = (await (await fetch(`${base}project/?list`)).json()) as { name: string; kind: string }[];
    expect(list.map((e) => `${e.name}:${e.kind}`).sort()).toEqual(["media:directory", "project.json:file"]);
    expect((await fetch(`${base}project/..%2Fsecret.txt`)).status).toBe(403);
    expect((await fetch(`${base}project/project.json`, { method: "PUT", body: "x" })).status).not.toBe(204);
  });

  it("ignores requests without the token of the run", async () => {
    const { origin } = await setup();
    // Not a route: the fallback page of the app, never a project file.
    expect(await (await fetch(`${origin}/__t/wrong/project/project.json`)).text()).toBe("<!doctype html>app");
  });

  it("writes sink bytes at their positions, commits on close and discards on abort", async () => {
    const { base, sinkFile, server } = await setup();
    await fetch(`${base}sink/a.mp4?pos=4`, { method: "PUT", body: new Uint8Array([4, 5]) });
    await fetch(`${base}sink/a.mp4?pos=0`, { method: "PUT", body: new Uint8Array([0, 1, 2, 3]) });
    expect(existsSync(sinkFile)).toBe(false);
    await fetch(`${base}sink/a.mp4?op=close`, { method: "POST" });
    expect([...readFileSync(sinkFile)]).toEqual([0, 1, 2, 3, 4, 5]);
    expect(server.sink()).toEqual({ bytes: 6, closed: true });
    rmSync(sinkFile);
    await fetch(`${base}sink/a.mp4?pos=0`, { method: "PUT", body: new Uint8Array([9]) });
    await fetch(`${base}sink/a.mp4?op=abort`, { method: "POST" });
    expect(existsSync(sinkFile)).toBe(false);
    expect(existsSync(`${sinkFile}.part`)).toBe(false);
  });

  it("stores uploads under out/ only, and reports progress", async () => {
    const { base, out, server } = await setup();
    const seen: string[] = [];
    server.onProgress((done, total) => seen.push(`${done}/${total}`));
    expect((await fetch(`${base}out/frames/f%201.png`, { method: "PUT", body: new Uint8Array([1, 2]) })).status).toBe(204);
    expect([...readFileSync(join(out, "frames", "f 1.png"))]).toEqual([1, 2]);
    expect((await fetch(`${base}out/..%2Fescape.png`, { method: "PUT", body: "x" })).status).toBe(403);
    await fetch(`${base}progress`, { method: "POST", body: JSON.stringify({ done: 3, total: 9 }) });
    expect(seen).toEqual(["3/9"]);
    expect(server.progress()).toEqual({ done: 3, total: 9 });
  });
});

describe("render --format", () => {
  it("takes --format, else the extension of --out, else mp4", () => {
    expect(formatOf("png", "out")).toBe("png");
    expect(formatOf(undefined, "a/b.webm")).toBe("webm");
    expect(formatOf(undefined, "a/b.GIF")).toBe("gif");
    expect(formatOf(undefined, "a/b.mp4")).toBe("mp4");
    expect(formatOf(undefined, "a/bwebm")).toBe("mp4");
    expect(formatOf("mov", "a.mp4")).toBeNull();
    const parsed = parseArgs(["p", "--out", "x", "--format", "gif", "--transparent"]);
    expect(parsed.options.get("--format")).toBe("gif");
    expect(parsed.flags.has("--transparent")).toBe(true);
  });
});
