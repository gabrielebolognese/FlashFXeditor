import { describe, expect, it } from "vitest";
import { createMemoryDir } from "./memoryFs.js";
import { openSegments, parseOpenLink, resolveLinkTarget, withoutOpenLink } from "./projectsFolder.js";

describe("open links", () => {
  it("reads and cleans the open parameter", () => {
    expect(parseOpenLink("?open=interop/basic")).toBe("interop/basic");
    expect(parseOpenLink("?open=interop%2Fbasic%2F")).toBe("interop/basic");
    expect(parseOpenLink("?open=interop%5Cbasic")).toBe("interop/basic");
    expect(parseOpenLink("?open=./a//b")).toBe("a/b");
    expect(parseOpenLink("")).toBeNull();
    expect(parseOpenLink("?open=")).toBeNull();
    expect(parseOpenLink("?open=../secret")).toBeNull();
    expect(openSegments("a/../b")).toBeNull();
  });

  it("drops only the open parameter from the address", () => {
    expect(withoutOpenLink("?open=a/b&renderer=webgl2")).toBe("?renderer=webgl2");
    expect(withoutOpenLink("?open=a/b")).toBe("");
  });
});

describe("resolveLinkTarget", () => {
  async function tree() {
    const root = createMemoryDir("fixtures");
    const basic = await root.dir("interop", { create: true }).then((d) => d!.dir("basic", { create: true }));
    await basic!.writeText("project.json", "{}");
    await (await root.dir("interop"))!.dir("empty", { create: true });
    return root;
  }

  it("finds the folder inside the projects folder", async () => {
    const root = await tree();
    const target = await resolveLinkTarget(root, "interop/basic");
    expect(target.ok && target.dir.name).toBe("basic");
  });

  it("names a missing folder and a folder without project.json", async () => {
    const root = await tree();
    expect(await resolveLinkTarget(root, "interop/nope")).toEqual({ ok: false, reason: "missing" });
    expect(await resolveLinkTarget(root, "interop/empty")).toEqual({ ok: false, reason: "noProject" });
    expect(await resolveLinkTarget(root, "../x")).toEqual({ ok: false, reason: "missing" });
  });
});
