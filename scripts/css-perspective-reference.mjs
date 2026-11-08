// The CSS reference check of Batch 70 (spec §21.15, acceptance 1): the card of fixtures/interop/card (one
// checkered shape turned on Y with a perspective) drawn by Chrome with CSS (`perspective` on the frame,
// `transform: rotateY()` on the card, both around their centers), screenshotted headless and compared
// with the card's committed expected frame through the CLI's SSIM compare.
// Usage: node scripts/css-perspective-reference.mjs [--ssim 0.98]. Needs Chrome and a built CLI
// (npm run build:cli). Writes out/css-reference/. Exit 0 when the SSIM reaches the threshold.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const ssimAt = process.argv.indexOf("--ssim");
const threshold = ssimAt > 0 ? Number(process.argv[ssimAt + 1]) : 0.98;
const fixture = join(root, "fixtures", "interop", "card");
const project = JSON.parse(readFileSync(join(fixture, "project.json"), "utf8"));
const { width, height, background, perspective } = project.settings;
const card = project.clips.card;
const t = card.transform;
const w = card.size.w * t.scale;
const h = card.size.h * t.scale;
const css = (c) => `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a})`;
const paths = card.paths.map((p) => `<path d="${p.d}" fill="${css(p.fill)}" fill-rule="${p.fillRule}"/>`).join("");
const left = width / 2 + t.x - w * t.anchor.x;
const top = height / 2 + t.y - h * t.anchor.y;
const html = `<!doctype html><html><head><style>
html, body { margin: 0; overflow: hidden; background: ${css(background)}; }
#frame { position: relative; width: ${width}px; height: ${height}px; perspective: ${perspective}px; perspective-origin: 50% 50%; overflow: hidden; }
#card { position: absolute; left: ${left}px; top: ${top}px; width: ${w}px; height: ${h}px; transform-origin: ${t.anchor.x * 100}% ${t.anchor.y * 100}%;
  transform: translateZ(${-(t.z ?? 0)}px) rotate(${t.rotation}deg) rotateY(${t.rotationY ?? 0}deg) rotateX(${t.rotationX ?? 0}deg); }
svg { display: block; }
</style></head><body><div id="frame"><div id="card"><svg width="${w}" height="${h}" viewBox="0 0 ${card.size.w} ${card.size.h}" preserveAspectRatio="none">${paths}</svg></div></div></body></html>`;

const out = join(root, "out", "css-reference");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "css"), { recursive: true });
const page = join(out, "card.html");
writeFileSync(page, html);
const chrome = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe` : undefined,
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((path) => path && existsSync(path));
if (!chrome) {
  console.error("Chrome not found");
  process.exit(1);
}
// The compare matches files by their frame suffix: name the screenshot like the expected frame.
const shot = join(out, "css", "Interop card-frame-0.png");
const run = spawnSync(chrome, ["--headless=new", "--hide-scrollbars", "--force-device-scale-factor=1", `--window-size=${width},${height}`, `--user-data-dir=${join(out, "profile")}`, `--screenshot=${shot}`, pathToFileURL(page).href], { encoding: "utf8" });
if (!existsSync(shot)) {
  console.error(`no screenshot: ${run.stderr}`);
  process.exit(1);
}
const compare = spawnSync(process.execPath, [join(root, "scripts", "cli", "run.mjs"), "compare", join(out, "css"), join(fixture, "expected"), "--ssim", String(threshold)], { cwd: root, encoding: "utf8" });
console.log(compare.stdout.trim());
if (compare.status !== 0) console.error(compare.stderr.trim());
process.exit(compare.status === 0 ? 0 : 1);
