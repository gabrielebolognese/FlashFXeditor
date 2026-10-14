// Spec §3.7: fails when a color literal appears in a stylesheet other than the generated tokens file.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = "src";
const ALLOWED = new Set(["src/styles/tokens.css"]);
const PATTERNS = [
  /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/,
  /\b(?:rgba?|hsla?)\(/,
  /\b(?:white|black)\b/,
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
    // Only declaration values can hold colors; selectors like `a:hover` have no value part we care about.
    for (const decl of line.split(/[;{}]/)) {
      const colon = decl.indexOf(":");
      if (colon === -1) continue;
      const value = decl.slice(colon + 1);
      if (PATTERNS.some((p) => p.test(value))) problems.push(`${name}:${i + 1}: ${decl.trim()}`);
    }
  });
}

if (problems.length > 0) {
  console.error("Color literals outside src/styles/tokens.css:\n" + problems.join("\n"));
  process.exit(1);
}
