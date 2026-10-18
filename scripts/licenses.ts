// Release build (Batch 50): `dist/licenses.txt` holds the license of every npm package bundled into the
// app and of the content fonts, as their licenses ask of copies that are passed on (MIT, ISC,
// Apache-2.0 notices; the SIL Open Font License travels with the fonts). Settings > About links to it.
// Vite's own `build.license` lists the main bundle only, and most packages (mp4box, mp4-muxer,
// transformers.js, ONNX Runtime) are in the worker bundles: `collect` goes into `worker.plugins` too, and
// the main build writes the file last (worker bundles are built while the main build transforms).
// Packages that another package inlines into its own prebuilt file (transformers.js's web build holds
// @huggingface/tokenizers and @huggingface/jinja) have no module id of their own: `INLINED` names them.
// Since Batch 51 the fonts are the font library (public/fonts/library, spec §20.1): one entry per
// family (its license, designer and copyright line, with the path of its full text, which ships in
// fonts/library/LICENSES/), then each license's full text once.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

export const LICENSES_FILE = "licenses.txt";
const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.|-|$)/i;
const RULE = "-".repeat(72);

interface Notice {
  title: string;
  texts: string[];
}

/** The package directory of a bundled module id (the last node_modules segment), or null. */
export function packageDir(id: string): string | null {
  const path = id.replace(/^\0/, "").replace(/[?#].*$/, "").replace(/\\/g, "/");
  const at = path.lastIndexOf("/node_modules/");
  if (at < 0) return null;
  const parts = path.slice(at + "/node_modules/".length).split("/");
  const name = parts[0]?.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  return name ? `${path.slice(0, at)}/node_modules/${name}` : null;
}

// Packages that ship no license file get their license's text; the copyright line names the holder
// of the project's own LICENSE (ONNX Runtime: Microsoft), else the package's author.
const HOLDERS: Readonly<Record<string, string>> = { "onnxruntime-common": "Microsoft Corporation", "onnxruntime-web": "Microsoft Corporation" };

/**
 * Packages bundled inside another package's prebuilt file, by that package (checked with the bundles'
 * sources: ONNX Runtime's bundle holds only its own code and onnxruntime-common, a package of its own).
 */
export const INLINED: Readonly<Record<string, readonly string[]>> = { "@huggingface/transformers": ["@huggingface/tokenizers", "@huggingface/jinja"] };

/** The package directories `INLINED` adds for a bundled package directory (next to it in its node_modules). */
export function inlinedDirs(dir: string): string[] {
  const path = dir.replace(/\\/g, "/");
  const at = path.lastIndexOf("/node_modules/");
  if (at < 0) return [];
  const name = path.slice(at + "/node_modules/".length);
  return (INLINED[name] ?? []).map((inner) => `${path.slice(0, at)}/node_modules/${inner}`);
}
const MIT = [
  "Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:",
  "The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.",
  "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.",
].join("\n\n");

const licenseTexts = (dir: string): string[] =>
  readdirSync(dir)
    .filter((file) => LICENSE_FILE.test(file))
    .sort()
    .map((file) => readFileSync(join(dir, file), "utf8").trim());

function packageNotice(dir: string): Notice {
  const json = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { name: string; version: string; license?: string; author?: string | { name?: string } };
  const texts = licenseTexts(dir);
  if (texts.length === 0 && json.license === "MIT") {
    const holder = HOLDERS[json.name] ?? (typeof json.author === "string" ? json.author : json.author?.name);
    texts.push(`MIT License${holder ? `\n\nCopyright (c) ${holder}` : ""}\n\n${MIT}`);
  }
  return { title: `${json.name} ${json.version} (${json.license ?? "license below"})`, texts };
}

interface CatalogEntry {
  family: string;
  slug: string;
  license: string;
  designer: string;
}

const LICENSE_NAMES: Readonly<Record<string, string>> = { "OFL-1.1": "SIL Open Font License 1.1", "Apache-2.0": "Apache License 2.0", "UFL-1.0": "Ubuntu Font Licence 1.0" };

/** The copyright lines at the top of a font's license text (before the license itself). */
export function copyrightLines(text: string): string[] {
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^(this font software is licensed|licensed under the apache|apache license|ubuntu font licence|-{3,})/i.test(trimmed)) break;
    if (trimmed !== "") lines.push(trimmed);
  }
  return lines;
}

/** One notice per library family, then each license's full text once. */
function fontNotices(libraryDir: string): Notice[] {
  const catalog = JSON.parse(readFileSync(join(libraryDir, "catalog.json"), "utf8")) as { families: CatalogEntry[] };
  const notices: Notice[] = [];
  const fullTexts = new Map<string, string>();
  for (const family of catalog.families) {
    const path = `fonts/library/LICENSES/${family.slug}.txt`;
    const text = readFileSync(join(libraryDir, "LICENSES", `${family.slug}.txt`), "utf8");
    if (!fullTexts.has(family.license)) fullTexts.set(family.license, text.trim());
    const name = LICENSE_NAMES[family.license] ?? family.license;
    notices.push({ title: `Font: ${family.family} (${name})`, texts: [[`Designer: ${family.designer}`, ...copyrightLines(text), `Full license text: ${path}`].join("\n")] });
  }
  for (const [id, text] of fullTexts) notices.push({ title: `Font license: ${LICENSE_NAMES[id] ?? id} (the text every font above under it is licensed with)`, texts: [text] });
  return notices;
}

function render(app: string, packages: readonly Notice[], fonts: readonly Notice[]): string {
  const section = (notice: Notice) => [RULE, notice.title, RULE, "", notice.texts.length > 0 ? notice.texts.join("\n\n") : "(no license file in the package)", ""].join("\n");
  return [
    `${app}: third-party licenses`,
    "",
    `This build bundles ${packages.length} open-source packages and ${fonts.filter((notice) => notice.title.startsWith("Font: ")).length} font families. Their licenses follow.`,
    "",
    ...packages.map(section),
    ...fonts.map(section),
  ].join("\n");
}

/** The two halves of the plugin: `collect` in `worker.plugins`, `emit` in `plugins`. */
export function licenses({ app, libraryDir }: { app: string; libraryDir: string }): { collect: Plugin; emit: Plugin } {
  const dirs = new Set<string>();
  const add = (bundle: Record<string, { type: string; moduleIds?: readonly string[] }>) => {
    for (const chunk of Object.values(bundle)) {
      for (const id of chunk.type === "chunk" ? (chunk.moduleIds ?? []) : []) {
        const dir = packageDir(id);
        if (!dir) continue;
        dirs.add(dir);
        for (const inner of inlinedDirs(dir)) dirs.add(inner);
      }
    }
  };
  const collect: Plugin = {
    name: "shorts-editor:licenses-collect",
    apply: "build",
    generateBundle(_output, bundle) {
      add(bundle);
    },
  };
  const emit: Plugin = {
    name: "shorts-editor:licenses",
    // The dev server has no bundle to list: it says where the list comes from.
    configureServer(server) {
      server.middlewares.use(`/${LICENSES_FILE}`, (_request, response) => {
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end(`${app}: the license list is made by the production build (npm run build writes dist/${LICENSES_FILE}).\n`);
      });
    },
    generateBundle(_output, bundle) {
      add(bundle);
      const packages = [...dirs].map(packageNotice).sort((a, b) => a.title.localeCompare(b.title));
      this.emitFile({ type: "asset", fileName: LICENSES_FILE, source: render(app, packages, fontNotices(libraryDir)) });
    },
  };
  return { collect, emit };
}
