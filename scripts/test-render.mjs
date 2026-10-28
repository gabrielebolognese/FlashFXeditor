// `npm run test:render` (spec §21.6, §21.1): renders every fixture under fixtures/interop/ that has an
// `expected/` folder on both backends with the headless CLI and checks the pictures:
//   WebGPU against the committed expected frames (SSIM at least 0.98),
//   WebGL2 against the WebGPU render (SSIM at least 0.97).
// It needs a GPU and a built dist/ (npm run build), so it is not part of `npm test`. Renders go to out/
// (gitignored). Exit 0 when every check passes, 1 otherwise.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const cli = join(root, "scripts", "cli", "run.mjs");
const EXPECTED_SSIM = 0.98;
const BACKEND_SSIM = 0.97;

function cliRun(args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** The frame numbers of the `<name>-frame-<n>.png` files in a folder (other `expected/` content, such as normalize results, is ignored). */
function expectedFrames(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => /-frame-(\d+)\.png$/i.exec(name)?.[1])
    .filter((n) => n !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
}

const interop = join(root, "fixtures", "interop");
const areas = readdirSync(interop, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && expectedFrames(join(interop, entry.name, "expected")).length > 0)
  .map((entry) => entry.name);

if (!existsSync(join(root, "dist", "index.html"))) {
  console.error("dist/ is missing: run npm run build first");
  process.exit(1);
}
if (areas.length === 0) {
  console.error("no fixture has expected frames");
  process.exit(1);
}

let failed = 0;
for (const area of areas) {
  const folder = join(interop, area);
  const frames = expectedFrames(join(folder, "expected"));
  const out = join(root, "out", "test-render", area);
  rmSync(out, { recursive: true, force: true });
  const steps = [];
  for (const backend of ["webgpu", "webgl2"]) {
    const render = cliRun(["render", folder, "--frames", frames.join(","), "--png", join(out, backend), "--backend", backend]);
    const used = /^(webgpu|webgl2):/m.exec(render.stderr)?.[1];
    steps.push({ name: `${area}: render ${backend}`, ok: render.status === 0 && used === backend, detail: render.status === 0 ? (used === backend ? "" : `ran on ${used}`) : render.stderr.trim().split("\n").pop() });
  }
  const expected = cliRun(["compare", join(out, "webgpu"), join(folder, "expected"), "--ssim", String(EXPECTED_SSIM)]);
  steps.push({ name: `${area}: webgpu against expected (SSIM >= ${EXPECTED_SSIM})`, ok: expected.status === 0, detail: expected.stdout.trim().split("\n").slice(0, 4).join(" | ") });
  const backends = cliRun(["compare", join(out, "webgl2"), join(out, "webgpu"), "--ssim", String(BACKEND_SSIM)]);
  steps.push({ name: `${area}: webgl2 against webgpu (SSIM >= ${BACKEND_SSIM})`, ok: backends.status === 0, detail: backends.stdout.trim().split("\n").slice(0, 4).join(" | ") });
  for (const step of steps) {
    console.log(`${step.ok ? "ok  " : "FAIL"} ${step.name}${step.ok ? "" : `: ${step.detail}`}`);
    if (!step.ok) failed++;
  }
}
console.log(failed === 0 ? `render checks passed (${areas.join(", ")})` : `${failed} render checks failed`);
process.exit(failed === 0 ? 0 : 1);
