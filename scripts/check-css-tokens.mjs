// Batch 46 (design-system compliance): besides colors (check-css-colors.mjs), sizes, durations, font
// weights and opacities in stylesheets come from the tokens in src/styles/tokens.css. Allowed literals:
// 0, the DS's 1px hairline, percentages, `ch` (widths in characters of mono readouts), unitless line
// counts and small local z-index steps. A value that needs a number gets a token (and a line under
// Design system gaps in docs/PROGRESS.md when the DS is silent).
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = "src";
const ALLOWED = new Set(["src/styles/tokens.css"]);
const RULES = [
  { name: "length", pattern: /(?<![\w.])(?:\d*\.\d+|[2-9]|\d{2,})px\b|(?<![\w.])\d*\.?\d+r?em\b/ },
  { name: "duration", pattern: /(?<![\w.])\d*\.?\d+m?s\b/ },
  { name: "font-weight", property: /^font-weight$/, pattern: /\d/ },
  { name: "opacity", property: /^opacity$/, pattern: /(?<![\w.])0?\.\d+/ },
];

function* cssFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* cssFiles(path);
    else if (entry.name.endsWith(".css")) yield path;
  }
}

const problems = [];
for (const file of cssFiles(ROOT)) {
  const name = relative(".", file).split(sep).join("/");
  if (ALLOWED.has(name)) continue;
  const lines = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " ")).split("\n");
  lines.forEach((line, i) => {
    for (const decl of line.split(/[;{}]/)) {
      const colon = decl.indexOf(":");
      if (colon === -1) continue;
      const property = decl.slice(0, colon).trim();
      // Selectors (`a:hover`) aside: values only (a module's own custom properties included).
      if (property === "" || /[\s>+~[(]/.test(property)) continue;
      const value = decl.slice(colon + 1);
      for (const rule of RULES) {
        if (rule.property && !rule.property.test(property)) continue;
        if (rule.pattern.test(value)) problems.push(`${name}:${i + 1}: ${rule.name} literal: ${decl.trim()}`);
      }
    }
  });
}

if (problems.length > 0) {
  console.error("Size, duration, weight or opacity literals outside src/styles/tokens.css (use a token):\n" + problems.join("\n"));
  process.exit(1);
}
