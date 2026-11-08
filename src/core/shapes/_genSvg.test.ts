/* eslint-disable no-restricted-syntax -- hex strings are SVG color data, not UI colors */
import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { buildSvgFixture, fixtureScale, SVG_FIXTURE_BACKGROUND, SVG_FIXTURE_ICONS } from "./svgFixture.js";

it("writes", () => {
  const svgs: Record<string, string> = {};
  for (const icon of SVG_FIXTURE_ICONS) svgs[icon.file] = readFileSync(`fixtures/interop/svg/icons/${icon.file}.svg`, "utf8");
  const { project, sizes } = buildSvgFixture(svgs);
  writeFileSync("fixtures/interop/svg/project.json", `${JSON.stringify(project, null, 2)}\n`);
  const bg = [SVG_FIXTURE_BACKGROUND.r, SVG_FIXTURE_BACKGROUND.g, SVG_FIXTURE_BACKGROUND.b].map((v) => Math.round(v * 255));
  const imgs = SVG_FIXTURE_ICONS.map((icon) => {
    const s = sizes[icon.file] as { w: number; h: number };
    const k = fixtureScale(s);
    const w = s.w * k;
    const h = s.h * k;
    return `<img src="icons/${icon.file}.svg" style="position:absolute;left:${400 + icon.x - w / 2}px;top:${400 + icon.y - h / 2}px;width:${w}px;height:${h}px">`;
  }).join("\n");
  writeFileSync("fixtures/interop/svg/reference.html", `<!doctype html>\n<html><body style="margin:0;width:800px;height:800px;overflow:hidden;position:relative;background:rgb(${bg.join(",")})">\n${imgs}\n</body></html>\n`);
});
