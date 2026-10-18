// Release build (Batch 50): `dist/licenses.txt` holds the license of every npm package bundled into the
// app and of the bundled content fonts, as their licenses ask of copies that are passed on (MIT, ISC,
// Apache-2.0 notices; the SIL Open Font License travels with the fonts). Settings > About links to it.
// Vite's own `build.license` lists the main bundle only, and most packages (mp4box, mp4-muxer,
// transformers.js, ONNX Runtime) are in the worker bundles: `collect` goes into `worker.plugins` too, and
// the main build writes the file last (worker bundles are built while the main build transforms).
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

/** One notice per font folder (its OFL.txt names the family's copyright holders). */
function fontNotices(fontsDir: string): Notice[] {
  return readdirSync(fontsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({ title: `Font: ${name} (SIL Open Font License 1.1)`, texts: licenseTexts(join(fontsDir, name)) }));
}

function render(app: string, packages: readonly Notice[], fonts: readonly Notice[]): string {
  const section = (notice: Notice) => [RULE, notice.title, RULE, "", notice.texts.length > 0 ? notice.texts.join("\n\n") : "(no license file in the package)", ""].join("\n");
  return [
    `${app}: third-party licenses`,
    "",
    `This build bundles ${packages.length} open-source packages and ${fonts.length} font families. Their licenses follow.`,
    "",
    ...packages.map(section),
    ...fonts.map(section),
  ].join("\n");
}

/** The two halves of the plugin: `collect` in `worker.plugins`, `emit` in `plugins`. */
export function licenses({ app, fontsDir }: { app: string; fontsDir: string }): { collect: Plugin; emit: Plugin } {
  const dirs = new Set<string>();
  const add = (bundle: Record<string, { type: string; moduleIds?: readonly string[] }>) => {
    for (const chunk of Object.values(bundle)) {
      for (const id of chunk.type === "chunk" ? (chunk.moduleIds ?? []) : []) {
        const dir = packageDir(id);
        if (dir) dirs.add(dir);
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
      this.emitFile({ type: "asset", fileName: LICENSES_FILE, source: render(app, packages, fontNotices(fontsDir)) });
    },
  };
  return { collect, emit };
}
