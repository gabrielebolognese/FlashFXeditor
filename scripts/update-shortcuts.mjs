// `npm run docs:shortcuts` (Batch 50): rewrites the README's generated "Keyboard shortcuts" section from
// the default keymap. The generator (src/app/shortcutDoc.ts) imports the command catalog, so it runs
// through Vite's module runner (the app's resolver and config). src/app/shortcutDoc.test.ts fails while
// the README is stale.
import { readFileSync, writeFileSync } from "node:fs";
import { runnerImport } from "vite";

const { module } = await runnerImport("/src/app/shortcutDoc.ts");
const before = readFileSync("README.md", "utf8");
const newline = before.includes("\r\n") ? "\r\n" : "\n";
const after = module.withShortcuts(before.replace(/\r\n/g, "\n"), module.shortcutsMarkdown()).replace(/\n/g, newline);
if (after === before) {
  console.log("README.md: the shortcuts section is up to date.");
} else {
  writeFileSync("README.md", after);
  console.log("README.md: the shortcuts section was rewritten from the keymap.");
}
