// `npm run cli -- <args>`: rebuilds dist-cli/project-cli.mjs when a source is newer, then runs it.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const out = join(root, "dist-cli", "project-cli.mjs");

function newest(dir) {
  let time = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) time = Math.max(time, newest(path));
    else if (/\.(ts|tsx|json)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) time = Math.max(time, statSync(path).mtimeMs);
  }
  return time;
}

const sources = Math.max(newest(join(root, "src")), newest(join(root, "scripts", "cli")), statSync(join(root, "package.json")).mtimeMs);
if (!existsSync(out) || statSync(out).mtimeMs < sources) {
  const build = spawnSync(process.execPath, [join(root, "node_modules", "vite", "bin", "vite.js"), "build", "--config", "vite.cli.config.ts", "--logLevel", "warn"], { cwd: root, stdio: "inherit" });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
const result = spawnSync(process.execPath, [out, ...process.argv.slice(2)], { cwd: process.cwd(), stdio: "inherit" });
process.exit(result.status ?? 1);
