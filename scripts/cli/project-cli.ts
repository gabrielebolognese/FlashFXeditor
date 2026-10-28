// The project command line (spec §21.3, Batch 54): `npm run cli -- <command>`, built to
// dist-cli/project-cli.mjs by `npm run build:cli`.
//   capabilities [--write]   prints the manifest (--write: writes capabilities.json, `npm run capabilities`)
//   validate <dir> [--json]  strict check of a project folder; exit 0 valid, 1 invalid, 2 usage error
//   info <dir> [--json]      what the project holds, with the facts the media files' headers give
//   normalize <dir> [--write] completes a sparse project (migration, defaults, media headers, library fonts)
//   render <dir> --out <file.mp4> | --frames <list> --png <dir>   headless render with the app's own compositor (§21.6)
//   compare <a> <b>          SSIM and PSNR of two videos or PNG folders (§21.6)
//   schema                   the JSON Schema of project.json
//   docs                     writes the field reference of docs/INTEROP.md (`npm run docs:interop`)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildCapabilities, formatCapabilities } from "../../src/core/capabilities.js";
import { projectJsonSchema } from "../../src/core/document/jsonSchema.js";
import { FIELDS_BEGIN_START, FIELDS_END, fieldReference } from "../../src/core/document/interopDoc.js";
import { normalizeProjectFolder, projectInfo, validateProjectFolder, type FolderReport } from "./folder.js";
import { compareCommand, renderCommand, RENDER_USAGE } from "./render.js";

const root = new URL("../", import.meta.url);

function appVersion(): string {
  return (JSON.parse(readFileSync(new URL("package.json", root), "utf8")) as { version: string }).version;
}

const USAGE = `Usage: project-cli <command>
  capabilities [--write]    print the capability manifest (--write: write capabilities.json)
  validate <dir> [--json]   check a project folder strictly (exit 0 valid, 1 invalid, 2 usage)
  info <dir> [--json]       duration, tracks, clips by kind, stand-ins, media and what their headers say
  normalize <dir> [--write] complete a sparse project (print it; --write: write project.json and fonts/)
  schema                    print the JSON Schema of project.json
${RENDER_USAGE}`;

const list = (counts: Record<string, number>): string => Object.entries(counts).map(([kind, count]) => `${count} ${kind}`).join(", ");

function printValidate(report: FolderReport, dir: string): void {
  for (const issue of report.errors) console.log(`error   ${issue.path}: ${issue.message}`);
  for (const issue of report.warnings) console.log(`warning ${issue.path}: ${issue.message}`);
  const stand = list(report.standIns);
  for (const status of report.convertible) console.log(`stand-in ${status.name} (${status.kind}): ${status.convertible ? "can be made editable" : `stays baked (${status.reason ?? "not convertible"})`}`);
  console.log(`${report.ok ? "valid" : "invalid"}: ${dir} (${report.errors.length} errors, ${report.warnings.length} warnings${stand ? `; stand-ins: ${stand}` : ""})`);
}

async function printInfo(dir: string, json: boolean): Promise<number> {
  try {
    const info = await projectInfo(dir);
    if (json) {
      console.log(JSON.stringify(info, null, 2));
      return 0;
    }
    console.log(`${info.name}${info.generator ? ` (by ${info.generator.name}${info.generator.version ? ` ${info.generator.version}` : ""})` : ""}`);
    console.log(`schema ${info.schemaVersion}, ${info.size.width}x${info.size.height} at ${info.fps} fps, ${info.duration} (${info.durationFrames} frames)`);
    for (const track of info.tracks) console.log(`  ${track.kind.padEnd(7)} ${track.name}: ${track.clips} clips`);
    console.log(`clips: ${list(info.clipsByKind) || "none"}`);
    console.log(`stand-ins: ${list(info.standIns) || "none"}`);
    for (const status of info.convertible) console.log(`  ${status.name} (${status.kind}): ${status.convertible ? "can be made editable" : `stays baked (${status.reason ?? "not convertible"})`}`);
    console.log(`media: ${info.mediaCount}, missing: ${info.missingMedia.length > 0 ? info.missingMedia.join(", ") : "none"}`);
    for (const media of info.media) {
      const facts = [media.width && media.height ? `${media.width}x${media.height}` : "", media.fps ? `${media.fps} fps` : "", `${(media.durationUs / 1e6).toFixed(3)} s`, media.hasAudio ? `audio${media.audioCodec ? ` ${media.audioCodec}` : ""}` : "", media.codec ?? ""].filter(Boolean).join(", ");
      console.log(`  ${media.id} ${media.kind} ${media.name}: ${facts} (header: ${media.header}${media.headerError ? `, ${media.headerError}` : ""})`);
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function writeDocs(): number {
  const file = new URL("docs/INTEROP.md", root);
  const text = readFileSync(file, "utf8");
  const begin = text.indexOf(FIELDS_BEGIN_START);
  const end = text.indexOf(FIELDS_END);
  if (begin < 0 || end < 0) {
    console.error("docs/INTEROP.md has no fields:begin / fields:end markers");
    return 1;
  }
  writeFileSync(file, `${text.slice(0, begin)}${fieldReference()}${text.slice(end + FIELDS_END.length)}`);
  console.log("docs/INTEROP.md field reference written");
  return 0;
}

async function normalizeCommand(dir: string, write: boolean): Promise<number> {
  try {
    const report = await normalizeProjectFolder(dir, { write, libraryDir: fileURLToPath(new URL("public/fonts/library/", root)), appVersion: appVersion() });
    for (const note of report.notes) console.error(`note    ${note.path}: ${note.message}`);
    for (const issue of report.errors) console.error(`error   ${issue.path}: ${issue.message}`);
    for (const issue of report.warnings) console.error(`warning ${issue.path}: ${issue.message}`);
    if (report.fonts.copies.length > 0) console.error(`fonts   ${write && report.written ? "wrote" : "would write"} ${report.fonts.copies.length} font files into fonts/`);
    if (!write) console.log(JSON.stringify(report.project, null, 2));
    else if (report.written) console.error(`written: ${dir}/project.json`);
    else console.error("not written: the result is invalid");
    return report.errors.length === 0 ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

/** Runs one command and returns the exit code. */
export async function run(argv: readonly string[]): Promise<number> {
  const [command, ...rest] = argv;
  // render and compare take options with values: they parse their own arguments.
  if (command === "render") return renderCommand(rest);
  if (command === "compare") return compareCommand(rest);
  const flags = new Set(rest.filter((arg) => arg.startsWith("--")));
  const args = rest.filter((arg) => !arg.startsWith("--"));
  const unknown = [...flags].filter((flag) => !["--json", "--write"].includes(flag));
  if (unknown.length > 0) {
    console.error(`Unknown option ${unknown.join(", ")}\n${USAGE}`);
    return 2;
  }
  switch (command) {
    case "capabilities": {
      const text = formatCapabilities(buildCapabilities(appVersion()));
      if (flags.has("--write")) {
        writeFileSync(new URL("capabilities.json", root), text);
        console.log("capabilities.json written");
      } else process.stdout.write(text);
      return 0;
    }
    case "validate": {
      if (args.length !== 1) break;
      const report = await validateProjectFolder(args[0] as string);
      if (flags.has("--json")) console.log(JSON.stringify({ ok: report.ok, schemaVersion: report.schemaVersion, errors: report.errors, warnings: report.warnings, standIns: report.standIns, convertible: report.convertible }, null, 2));
      else printValidate(report, args[0] as string);
      return report.ok ? 0 : 1;
    }
    case "info":
      if (args.length !== 1) break;
      return printInfo(args[0] as string, flags.has("--json"));
    case "normalize":
      if (args.length !== 1) break;
      return normalizeCommand(args[0] as string, flags.has("--write"));
    case "schema":
      if (args.length > 0) break;
      console.log(JSON.stringify(projectJsonSchema(), null, 2));
      return 0;
    case "docs":
      return writeDocs();
  }
  console.error(command ? `Unknown command or wrong arguments: ${[command, ...rest].join(" ")}\n${USAGE}` : USAGE);
  return 2;
}

process.exitCode = await run(process.argv.slice(2));
