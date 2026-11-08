/* eslint-disable no-restricted-syntax -- hex strings are SVG color data, not UI colors */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isColorFill } from "../document/fill.js";
import type { GradientFill, ShapePath } from "../document/types.js";
import { parsePathData, pathDataIssue } from "./pathData.js";
import { buildSvgFixture, SVG_FIXTURE_ICONS } from "./svgFixture.js";
import { importSvgShapes, parseColor, parseTransform, transformPath } from "./svgImport.js";

const read = (name: string) => readFileSync(`fixtures/interop/svg/icons/${name}.svg`, "utf8");
const run = (text: string) => {
  let n = 0;
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  return importSvgShapes(doc.documentElement, () => `p${++n}`);
};
const svg = (body: string, attrs = 'viewBox="0 0 100 100"') => `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;
const paths = (text: string): ShapePath[] => {
  const result = run(text);
  if (!result.ok) throw new Error(result.unsupported.join(", "));
  return result.paths;
};

describe("parseTransform and parseColor", () => {
  it("reads translate, scale, rotate about a point, skew and matrix, composed left to right", () => {
    expect(parseTransform("translate(10 20)")).toEqual([1, 0, 0, 1, 10, 20]);
    expect(parseTransform("scale(2)")).toEqual([2, 0, 0, 2, 0, 0]);
    expect(parseTransform("translate(5,0) scale(2 3)")).toEqual([2, 0, 0, 3, 5, 0]);
    const m = parseTransform("rotate(90 10 10)") as unknown as number[];
    // (20, 10) turns a quarter about (10, 10) to (10, 20).
    expect((m[0] as number) * 20 + (m[2] as number) * 10 + (m[4] as number)).toBeCloseTo(10);
    expect((m[1] as number) * 20 + (m[3] as number) * 10 + (m[5] as number)).toBeCloseTo(20);
    expect(parseTransform("matrix(1 2 3 4 5 6)")).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parseTransform("wobble(3)")).toBeNull();
    expect(parseTransform("")).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it("reads hex, rgb(), named colors and refuses the rest", () => {
    expect(parseColor("#f00")).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseColor("#00ff0080")?.a).toBeCloseTo(0.502, 2);
    expect(parseColor("rgb(255, 0, 0)")).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(parseColor("rgba(0 0 255 / 50%)")).toEqual({ r: 0, g: 0, b: 1, a: 0.5 });
    expect(parseColor("white")).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(parseColor("hsl(10 50% 50%)")).toBeNull();
  });

  it("moves path points", () => {
    const moved = transformPath(parsePathData("M0 0 L10 0 C10 5 5 10 0 10 Z"), [2, 0, 0, 1, 1, 1]);
    expect(moved[0]).toMatchObject({ x: 1, y: 1, closed: true });
    expect(moved[0]?.cmds).toEqual([0, 21, 1, 1, 21, 6, 11, 11, 1, 11]);
  });
});

describe("importSvgShapes", () => {
  it("makes one path per drawable element with the view box as size and its top left as the origin", () => {
    const result = run(svg('<rect x="10" y="20" width="30" height="40" fill="#f00"/><circle cx="60" cy="60" r="10" fill="none" stroke="blue"/>', 'viewBox="5 5 90 80"'));
    if (!result.ok) throw new Error("not ok");
    expect(result.size).toEqual({ w: 90, h: 80 });
    expect(result.paths).toHaveLength(2);
    expect(result.paths[0]?.d.startsWith("M5 15")).toBe(true);
    expect(result.paths[0]?.fill).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    expect(result.paths[1]?.fill).toBeNull();
    expect(result.paths[1]?.stroke?.color).toEqual({ r: 0, g: 0, b: 1, a: 1 });
    for (const path of result.paths) expect(pathDataIssue(path.d)).toBeNull();
  });

  it("falls back to width and height without a view box, and refuses an SVG with neither", () => {
    const sized = run(svg('<rect width="10" height="10"/>', 'width="40" height="30"'));
    expect(sized.ok && sized.size).toEqual({ w: 40, h: 30 });
    expect(run(svg('<rect width="10" height="10"/>', "")).ok).toBe(false);
  });

  it("takes style declarations over attributes, and inherits down groups", () => {
    const [path] = paths(svg('<g fill="#00f" stroke="#fff" stroke-width="4" stroke-linecap="round"><path d="M0 0L10 10" style="fill:#0f0;stroke-width:2"/></g>'));
    expect(path?.fill).toEqual({ r: 0, g: 1, b: 0, a: 1 });
    expect(path?.stroke).toMatchObject({ width: 2, cap: "round", join: "miter", align: "center" });
  });

  it("bakes group transforms into the path data and scales the stroke by them", () => {
    const [path] = paths(svg('<g transform="translate(10 10) scale(2)"><path d="M0 0L5 0" stroke="#fff" stroke-width="3" stroke-dasharray="2 1"/></g>'));
    expect(path?.d).toBe("M10 10L20 10");
    expect(path?.stroke?.width).toBe(6);
    expect(path?.stroke?.dash).toEqual([4, 2]);
  });

  it("multiplies element opacity and fill opacity into the color alpha", () => {
    const [path] = paths(svg('<g opacity="0.5"><rect width="10" height="10" fill="#fff" fill-opacity="0.5"/></g>'));
    expect(path?.fill).toMatchObject({ a: 0.25 });
  });

  it("reads polyline, polygon, line, ellipse and rounded rect geometry", () => {
    const list = paths(svg('<polygon points="0,0 10,0 10,10"/><polyline points="0,0 5,5 10,0" fill="none" stroke="#fff"/><line x1="0" y1="0" x2="9" y2="9" stroke="#fff"/><ellipse cx="50" cy="50" rx="20" ry="10"/><rect width="20" height="10" rx="3"/>'));
    expect(list).toHaveLength(5);
    expect(list[0]?.d.endsWith("Z")).toBe(true);
    expect(list[1]?.d.endsWith("Z")).toBe(false);
    expect(list[4]?.d).toContain("C");
  });

  it("reads currentColor and the fill rule", () => {
    const [path] = paths(svg('<path d="M0 0L10 0L5 10Z" fill="currentColor" color="#abcdef" fill-rule="evenodd"/>'));
    expect(path?.fillRule).toBe("evenodd");
    expect(path?.fill).toMatchObject({ r: 0xab / 255 });
  });

  it("turns a linear gradient into stops along the renderer's gradient line", () => {
    const [path] = paths(svg('<defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f" stop-opacity="0.5"/></linearGradient></defs><rect width="100" height="50" fill="url(#g)"/>'));
    const fill = path?.fill as GradientFill;
    expect(isColorFill(fill)).toBe(false);
    expect(fill.type).toBe("linear");
    // x1 to x2 runs left to right: the renderer's direction (-sin a, cos a) is +x at a = -90 degrees.
    expect(fill.angle).toBeCloseTo(-90, 5);
    expect(fill.stops[0]?.color).toMatchObject({ r: 1, g: 0, b: 0 });
    expect(fill.stops.at(-1)?.color).toMatchObject({ b: 1, a: 0.5 });
    expect(fill.stops[0]?.at).toBe(0);
    expect(fill.stops.at(-1)?.at).toBe(1);
  });

  it("follows href for the stops and user-space gradient vectors", () => {
    const [path] = paths(svg('<defs><linearGradient id="base"><stop offset="0" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient><linearGradient id="g" href="#base" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100"/></defs><rect width="100" height="100" fill="url(#g)"/>'));
    const fill = path?.fill as GradientFill;
    expect(fill.angle).toBeCloseTo(0, 5);
    expect(fill.stops).toHaveLength(2);
  });

  it("clips the stops of a gradient vector shorter than the shape and pads the ends", () => {
    const [path] = paths(svg('<defs><linearGradient id="g" x1="0.25" x2="0.75" y1="0" y2="0"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/>'));
    const stops = (path?.fill as GradientFill).stops;
    expect(stops.map((s) => s.at)).toEqual([0, 0.25, 0.75, 1]);
    expect(stops[0]?.color).toMatchObject({ r: 1 });
    expect(stops[3]?.color).toMatchObject({ b: 1 });
  });

  it("turns a radial gradient into a center fraction and a radius fraction of half the box diagonal", () => {
    const [path] = paths(svg('<defs><radialGradient id="g" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient></defs><circle cx="50" cy="50" r="40" fill="url(#g)"/>'));
    const fill = path?.fill as GradientFill;
    expect(fill.type).toBe("radial");
    expect(fill.center.x).toBeCloseTo(0.5, 2);
    expect(fill.radius).toBeCloseTo(Math.SQRT1_2, 2);
  });

  it("names what the subset does not cover instead of importing part of it", () => {
    const cases: [string, string][] = [
      ['<defs><filter id="f"><feGaussianBlur stdDeviation="1"/></filter></defs><rect width="9" height="9" filter="url(#f)"/>', "filter"],
      ['<mask id="m"><rect width="9" height="9" fill="#fff"/></mask><rect width="9" height="9" mask="url(#m)"/>', "mask"],
      ['<clipPath id="c"><rect width="5" height="5"/></clipPath><rect width="9" height="9" clip-path="url(#c)"/>', "clipPath"],
      ["<text x='1' y='9'>Hi</text>", "text"],
      ['<image href="a.png" width="9" height="9"/>', "image"],
      ['<defs><pattern id="p" width="2" height="2"><rect width="1" height="1"/></pattern></defs><rect width="9" height="9" fill="url(#p)"/>', "pattern"],
      ['<defs><path id="a" d="M0 0L9 9"/></defs><use href="#a"/>', "use"],
      ['<linearGradient id="g"><stop offset="0" stop-color="#f00"/><stop offset="1" stop-color="#00f"/></linearGradient><path d="M0 0L9 9" stroke="url(#g)"/>', "gradient stroke"],
    ];
    for (const [body, name] of cases) {
      const result = run(svg(body));
      expect(result.ok, name).toBe(false);
      if (!result.ok) expect(result.unsupported, name).toContain(name);
    }
  });

  it("skips hidden elements and metadata, and refuses a document with nothing to draw", () => {
    expect(paths(svg('<title>t</title><desc>d</desc><rect width="5" height="5" display="none"/><rect width="9" height="9"/>'))).toHaveLength(1);
    expect(run(svg("<g/>")).ok).toBe(false);
  });
});

describe("fixtures/interop/svg (Batch 66)", () => {
  it("project.json is what importing the icons gives", () => {
    const svgs: Record<string, string> = {};
    for (const icon of SVG_FIXTURE_ICONS) svgs[icon.file] = read(icon.file);
    const fresh = buildSvgFixture(svgs).project;
    expect(JSON.parse(readFileSync("fixtures/interop/svg/project.json", "utf8"))).toEqual(JSON.parse(JSON.stringify(fresh)));
  });

  it("the icon with a filter is not imported, and the message names the filter", () => {
    const result = run(read("filter"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.unsupported).toEqual(["filter"]);
  });

  it("the icons use paths, transforms, strokes, dashes, fill rules and gradients", () => {
    expect(paths(read("gauge")).some((path) => path.fill && !isColorFill(path.fill))).toBe(true);
    expect(paths(read("badge")).some((path) => path.fillRule === "evenodd")).toBe(true);
    expect(paths(read("arrow")).some((path) => path.stroke?.dash)).toBe(true);
  });
});
