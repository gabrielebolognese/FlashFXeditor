// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEnhanceServer, jobError, presetList, writePlan, type EnhanceJob, type EnhanceReport } from "../../../scripts/cli/enhance.js";
import type { Effect } from "../../core/document/types.js";
import { effectIssues } from "../../core/effects/effectParams.js";
import { NEUTRAL_CORRECTION } from "../../core/effects/colorCorrect.js";
import type { ClipEnhancement } from "../../core/enhance/solve.js";

const dirs: string[] = [];
function projectDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "enhance-test-"));
  dirs.push(dir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "project.json"), "{}");
  return dir;
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const item = (clipId: string): ClipEnhancement => ({
  clipId,
  denoise: { method: "hybrid", luma: 0.5, chroma: 0.7, detail: 0.45, shadows: 0.5, noise: 0.01 },
  color: { ...NEUTRAL_CORRECTION, gamma: 1.3, contrast: 20 },
  measured: { brightness: 0.3, saturation: 0.1, noise: 0.01, lumaNoise: 0.01, chromaNoise: 0.004, illuminant: [1, 0.9, 0.8] },
  predicted: { brightness: 0.46, saturation: 0.12 },
});

describe("enhance jobs (v1.3)", () => {
  it("refuses a job that cannot run before any work", () => {
    const dir = projectDir();
    expect(jobError({ project: dir })).toBeNull();
    expect(jobError({ project: "" })).toMatch(/project/);
    expect(jobError({ project: join(dir, "missing") })).toMatch(/no project.json/);
    expect(jobError({ project: dir, preset: "nope" })).toMatch(/unknown "nope"/);
    expect(jobError({ project: dir, matchStrength: 2 })).toMatch(/between 0 and 1/);
    expect(jobError({ project: dir, denoise: false, color: false })).toMatch(/nothing to do/);
    expect(jobError({ project: dir, clips: "c1" as unknown as string[] })).toMatch(/list of clip ids/);
  });

  it("writes a plan into the clips of a parsed project.json and names the clips it did not find", () => {
    const project: { clips: Record<string, { effects?: Effect[] }> } = { clips: { a: {}, b: { effects: [{ id: "fx1", type: "glow", enabled: true, params: {} }] } } };
    expect(writePlan(project, [item("a"), item("b"), item("gone")])).toEqual(["gone"]);
    expect(project.clips.a?.effects?.map((e) => e.type)).toEqual(["denoise", "colorCorrect"]);
    expect(project.clips.b?.effects?.map((e) => e.type)).toEqual(["denoise", "colorCorrect", "glow"]);
    expect(effectIssues(project.clips.a?.effects, "a")).toEqual([]);
  });

  it("lists ten presets, one of them the default", () => {
    const list = presetList();
    expect(list).toHaveLength(10);
    expect(list.filter((preset) => preset.default)).toHaveLength(1);
  });
});

describe("enhance endpoint (v1.3)", () => {
  async function withServer<T>(run: (job: EnhanceJob) => Promise<EnhanceReport>, work: (base: string) => Promise<T>): Promise<T> {
    const server = createEnhanceServer("9.9.9", run);
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    try {
      return await work(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
    }
  }
  const ok = (job: EnhanceJob): EnhanceReport => ({ ok: true, project: job.project, preset: job.preset ?? "balanced", written: !job.dryRun, clips: [item("a")], skipped: [], errors: [] });
  const post = (base: string, body: unknown) => fetch(`${base}/enhance`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

  it("answers health and presets", async () => {
    await withServer(
      async (job) => ok(job),
      async (base) => {
        const health = (await (await fetch(`${base}/health`)).json()) as { ok: boolean; version: string };
        expect(health).toMatchObject({ ok: true, version: "9.9.9" });
        const presets = (await (await fetch(`${base}/presets`)).json()) as { default: string; presets: unknown[] };
        expect(presets.default).toBe("balanced");
        expect(presets.presets).toHaveLength(10);
        expect((await fetch(`${base}/nope`)).status).toBe(404);
        expect((await fetch(`${base}/enhance`)).status).toBe(405);
      },
    );
  });

  it("runs a job and returns its report; a bad request never reaches the runner", async () => {
    const dir = projectDir();
    const seen: EnhanceJob[] = [];
    await withServer(
      async (job) => {
        seen.push(job);
        return ok(job);
      },
      async (base) => {
        const response = await post(base, { project: dir, preset: "crisp", dryRun: true });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ ok: true, preset: "crisp", written: false });
        expect((await post(base, "{not json")).status).toBe(400);
        expect((await post(base, { project: dir, preset: "nope" })).status).toBe(400);
        expect((await post(base, [1])).status).toBe(400);
      },
    );
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ project: dir, preset: "crisp" });
  });

  it("runs jobs one at a time and reports a failed job with 422 or 500", async () => {
    const dir = projectDir();
    let running = 0;
    let most = 0;
    let calls = 0;
    await withServer(
      async (job) => {
        calls += 1;
        running += 1;
        most = Math.max(most, running);
        await new Promise((done) => setTimeout(done, 20));
        running -= 1;
        if (job.preset === "smooth") throw new Error("chrome did not start");
        return job.preset === "vivid" ? { ...ok(job), ok: false, written: false, errors: ["no clip could be measured"] } : ok(job);
      },
      async (base) => {
        const statuses = await Promise.all([post(base, { project: dir }), post(base, { project: dir, preset: "vivid" }), post(base, { project: dir, preset: "smooth" }), post(base, { project: dir })]).then((all) => all.map((r) => r.status));
        expect(statuses).toEqual([200, 422, 500, 200]);
      },
    );
    expect(most).toBe(1);
    expect(calls).toBe(4);
  });
});
