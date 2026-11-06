// `fill` (spec §21.24, Batch 80): sets the template parameters of compound instances from a values file.
// `{ "<instance clip id or name>": { "<parameter id or label>": <value>, ... }, ... }`. A clip id matches that
// clip; a name matches every compound clip with it (in the project and inside sequences). A color is an
// RGBA object or a `#rrggbb` / `#rrggbbaa` string. Pure; the CLI reads and writes the files.
import { parseHexColor } from "./color.js";
import { paramValueIssue } from "./templates.js";
import type { CompoundClip, JsonValue, Project, TemplateParam } from "./types.js";

export interface FillResult {
  project: Project;
  /** `instance id: parameter id` for every value set, in file order. */
  applied: string[];
  /** Everything that could not be applied; when not empty, `project` is the input unchanged. */
  errors: string[];
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function findParam(params: readonly TemplateParam[], key: string): TemplateParam | undefined {
  return params.find((param) => param.id === key) ?? params.find((param) => param.label.toLowerCase() === key.toLowerCase());
}

/** The value as the parameter holds it: a `#rrggbb` string becomes a color. */
function coerce(param: TemplateParam, value: unknown): unknown {
  if (param.kind === "color" && typeof value === "string") return parseHexColor(value) ?? value;
  return value;
}

/** A copy of `project` with the values of `values` set on the instances they name. */
export function fillTemplates(project: Project, values: unknown): FillResult {
  const errors: string[] = [];
  const applied: string[] = [];
  if (!isObject(values)) return { project, applied, errors: ["the values file must be an object: { \"<instance>\": { \"<parameter>\": value } }"] };
  const next = structuredClone(project);
  const instances = Object.values(next.clips).filter((clip): clip is CompoundClip => clip.kind === "compound");
  for (const [instance, fields] of Object.entries(values)) {
    const byId = next.clips[instance];
    const targets = byId?.kind === "compound" ? [byId] : instances.filter((clip) => clip.name === instance);
    if (targets.length === 0) {
      errors.push(`no compound clip with the id or name "${instance}"`);
      continue;
    }
    if (!isObject(fields)) {
      errors.push(`"${instance}": must be an object of parameter values`);
      continue;
    }
    for (const clip of targets) {
      const params = next.sequences[clip.sequenceId]?.params ?? [];
      for (const [key, raw] of Object.entries(fields)) {
        const param = findParam(params, key);
        if (!param) {
          errors.push(`"${instance}": the sequence "${next.sequences[clip.sequenceId]?.name ?? clip.sequenceId}" has no parameter "${key}" (it has ${params.map((p) => `"${p.id}"`).join(", ") || "none"})`);
          continue;
        }
        const value = coerce(param, raw);
        const bad = paramValueIssue(param, value);
        if (bad) {
          errors.push(`"${instance}": "${param.id}" ${bad}`);
          continue;
        }
        (clip.params ??= {})[param.id] = structuredClone(value) as JsonValue;
        applied.push(`${clip.id}: ${param.id}`);
      }
    }
  }
  return errors.length > 0 ? { project, applied: [], errors } : { project: next, applied, errors };
}
