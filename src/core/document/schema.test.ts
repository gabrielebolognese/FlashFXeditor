import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projectJsonSchema } from "./jsonSchema.js";
import { FIELD_TABLE, schemaOf, type FieldType } from "./schema.js";
import { strictIssues } from "./strict.js";

const source = (file: string) => readFileSync(join(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

/** `interface name extends base { ... }` of a TypeScript file: its members at one level of indentation. */
function interfaces(text: string): Map<string, { extendsName: string | null; members: string[] }> {
  const found = new Map<string, { extendsName: string | null; members: string[] }>();
  for (const match of text.matchAll(/^export interface (\w+)(?: extends (\w+))? \{\n([\s\S]*?)^\}/gm)) {
    const members = [...(match[3] as string).matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1] as string);
    found.set(match[1] as string, { extendsName: match[2] ?? null, members });
  }
  return found;
}

const typesFile = interfaces(source("src/core/document/types.ts"));
const fontsFile = interfaces(source("src/text/fonts.ts"));

/** The schema describing each TypeScript interface, from the `types` lists of the table. */
const schemaOfType = new Map(Object.values(FIELD_TABLE).flatMap((schema) => schema.types.map((type) => [type, schema.name] as const)));

describe("the field table covers types.ts (spec §21.3)", () => {
  it("has a schema for every exported interface of types.ts and for the font faces", () => {
    const missing = [...typesFile.keys(), "ProjectFontFace"].filter((name) => !schemaOfType.has(name));
    expect(missing).toEqual([]);
  });

  it("names exactly the fields of each interface", () => {
    const all = new Map([...typesFile, ...fontsFile]);
    for (const [type, schemaName] of schemaOfType) {
      const declared = all.get(type);
      expect(declared, `interface ${type}`).toBeDefined();
      const members = [...(declared?.members ?? []), ...(declared?.extendsName ? (all.get(declared.extendsName)?.members ?? []) : [])].filter((name) => name !== "prop");
      const fields = Object.keys(schemaOf(schemaName).fields);
      if (type === "Keyframes") continue; // an index signature: its keys are the property ids
      expect(fields.sort(), `${type} -> ${schemaName}`).toEqual([...new Set(members)].sort());
    }
  });
});

function typesIn(type: FieldType): FieldType[] {
  return [type, ...(type.t === "array" || type.t === "record" ? typesIn(type.item) : type.t === "union" ? type.options.flatMap((option) => typesIn(option.type)) : [])];
}

describe("the table itself", () => {
  it("only refers to schemas it has", () => {
    for (const schema of Object.values(FIELD_TABLE)) {
      const all = [...Object.values(schema.fields).flatMap((field) => typesIn(field.type)), ...(schema.value ? typesIn(schema.value) : [])];
      for (const type of all) if (type.t === "object") expect(FIELD_TABLE[type.schema], `${schema.name} -> ${type.schema}`).toBeDefined();
      for (const variant of Object.values(schema.variants ?? {})) expect(FIELD_TABLE[variant], variant).toBeDefined();
    }
  });

  it("gives defaults that pass their own field type", () => {
    for (const schema of Object.values(FIELD_TABLE)) {
      for (const [key, field] of Object.entries(schema.fields)) {
        if (field.default !== undefined) expect(defaultIssues(field.type, field.default), `${schema.name}.${key}`).toEqual([]);
      }
    }
  });
});

/** A default checked against its type (a simple check: the validator itself reads whole objects). */
function defaultIssues(type: FieldType, value: unknown): string[] {
  switch (type.t) {
    case "enum":
      return type.values.includes(value as string | number) ? [] : [`${JSON.stringify(value)} is not in the enum`];
    case "number":
      return typeof value === "number" && (type.min === undefined || value >= type.min) && (type.max === undefined || value <= type.max) ? [] : [`${String(value)} is out of range`];
    case "boolean":
      return typeof value === "boolean" ? [] : ["not a boolean"];
    case "object":
      if (value === null && type.nullable) return [];
      return strictIssues(type.schema, value).map((issue) => `${issue.path} ${issue.message}`);
    case "union":
      if (value === null && type.nullable) return [];
      return strictIssues("RGBA", value).map((issue) => `${issue.path} ${issue.message}`);
    case "record":
      return typeof value === "object" && value !== null ? [] : ["not an object"];
    case "array":
      return Array.isArray(value) ? [] : ["not an array"];
    default:
      return [];
  }
}

describe("the JSON Schema (npm run cli -- schema)", () => {
  const schema = projectJsonSchema() as { $schema: string; $ref: string; $defs: Record<string, { properties?: Record<string, unknown>; additionalProperties?: unknown; oneOf?: unknown[] }> };

  it("is draft 2020-12 and describes every object and every field of the table", () => {
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.$ref).toBe("#/$defs/Project");
    expect(Object.keys(schema.$defs).sort()).toEqual(Object.keys(FIELD_TABLE).sort());
    for (const table of Object.values(FIELD_TABLE)) {
      const def = schema.$defs[table.name];
      if (table.variants) expect(def?.oneOf).toHaveLength(Object.keys(table.variants).length);
      else if (!table.value) {
        expect(Object.keys(def?.properties ?? {}).sort()).toEqual(Object.keys(table.fields).sort());
        expect(def?.additionalProperties).toBe(false);
      }
    }
  });
});

// --- A small interpreter of the generated schema (the keywords it uses), so the fixture is checked against
// the JSON Schema itself and not only against the validator built from the same table. -----------------------

type Node = { [key: string]: unknown };

function conforms(node: Node, value: unknown, defs: Record<string, Node>): boolean {
  if (typeof node.$ref === "string") return conforms(defs[node.$ref.replace("#/$defs/", "")] as Node, value, defs);
  if (Array.isArray(node.oneOf)) return (node.oneOf as Node[]).filter((option) => conforms(option, value, defs)).length === 1;
  if (Array.isArray(node.anyOf)) return (node.anyOf as Node[]).some((option) => conforms(option, value, defs));
  if (Array.isArray(node.enum)) return node.enum.includes(value);
  const isObj = typeof value === "object" && value !== null && !Array.isArray(value);
  switch (node.type) {
    case "string":
      return typeof value === "string" && (node.minLength === undefined || value.length >= (node.minLength as number));
    case "boolean":
      return typeof value === "boolean";
    case "number":
    case "integer": {
      if (typeof value !== "number" || !Number.isFinite(value) || (node.type === "integer" && !Number.isInteger(value))) return false;
      return (node.minimum === undefined || value >= (node.minimum as number)) && (node.exclusiveMinimum === undefined || value > (node.exclusiveMinimum as number)) && (node.maximum === undefined || value <= (node.maximum as number));
    }
    case "array":
      return Array.isArray(value) && (node.minItems === undefined || value.length >= (node.minItems as number)) && (node.maxItems === undefined || value.length <= (node.maxItems as number)) && value.every((item) => conforms(node.items as Node, item, defs));
    case "object": {
      if (!isObj) return false;
      const record = value as Record<string, unknown>;
      const properties = (node.properties ?? {}) as Record<string, Node>;
      if (((node.required ?? []) as string[]).some((key) => record[key] === undefined)) return false;
      const names = (node.propertyNames as { enum?: string[] } | undefined)?.enum;
      return Object.entries(record).every(([key, inner]) => {
        if (names && !names.includes(key)) return false;
        if (properties[key]) return conforms(properties[key], inner, defs);
        if (node.additionalProperties === false) return false;
        return typeof node.additionalProperties === "object" ? conforms(node.additionalProperties as Node, inner, defs) : true;
      });
    }
    default:
      return true;
  }
}

describe("the basic fixture against the JSON Schema", () => {
  const defs = (projectJsonSchema() as { $defs: Record<string, Node> }).$defs;
  const read = (path: string) => JSON.parse(readFileSync(join(process.cwd(), path), "utf8")) as Record<string, unknown>;

  it("conforms, and the interpreter refuses what the schema forbids", () => {
    const project = read("fixtures/interop/basic/project.json");
    expect(conforms(defs.Project as Node, project, defs)).toBe(true);
    for (const broken of ["unknown-clip-field", "opacity-string", "transform-without-anchor", "fractional-frame"]) {
      expect(conforms(defs.Project as Node, read(`fixtures/interop/broken/${broken}/project.json`), defs), broken).toBe(false);
    }
  });

  it("describes the fonts manifest too", () => {
    expect(conforms(defs.FontManifest as Node, read("fixtures/interop/basic/fonts/fonts.json"), defs)).toBe(true);
  });
});
