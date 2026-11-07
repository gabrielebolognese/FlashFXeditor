// A JSON Schema (draft 2020-12) of project.json generated from the field table (spec §21.3, Batch 54):
// `npm run cli -- schema`. Pure.
import { FIELD_TABLE, type FieldType, type ObjectSchema } from "./schema.js";
import { SCHEMA_VERSION } from "./types.js";

type Json = Record<string, unknown>;

const ref = (name: string): Json => ({ $ref: `#/$defs/${name}` });

function typeSchema(type: FieldType): Json {
  switch (type.t) {
    case "string":
      return { type: "string", ...(type.nonEmpty && { minLength: 1 }) };
    case "boolean":
      return { type: "boolean" };
    case "number":
      return {
        type: type.integer ? "integer" : "number",
        ...(type.min !== undefined && { [type.exclusiveMin ? "exclusiveMinimum" : "minimum"]: type.min }),
        ...(type.max !== undefined && { maximum: type.max }),
      };
    case "enum":
      return { enum: [...type.values] };
    case "object":
      return ref(type.schema);
    case "array":
      return { type: "array", items: typeSchema(type.item), ...(type.length !== undefined && { minItems: type.length, maxItems: type.length }) };
    case "record":
      return { type: "object", ...(type.keys && { propertyNames: { enum: [...type.keys] } }), additionalProperties: typeSchema(type.item) };
    case "union":
      return { anyOf: type.options.map((option) => typeSchema(option.type)) };
    case "json":
      return { type: "object" };
    case "numberOrVector":
      return { anyOf: [{ type: "number" }, { type: "array", items: { type: "number" }, minItems: 1, maxItems: type.max }] };
  }
}

function objectSchema(schema: ObjectSchema): Json {
  if (schema.value) return { description: schema.doc, ...typeSchema(schema.value) };
  if (schema.variants) {
    return { description: schema.doc, oneOf: Object.values(schema.variants).map(ref) };
  }
  const required = Object.entries(schema.fields).filter(([, field]) => field.required).map(([key]) => key);
  return {
    description: schema.doc,
    type: "object",
    properties: Object.fromEntries(
      Object.entries(schema.fields).map(([key, field]) => [key, { ...typeSchema(field.type), description: field.doc, ...(field.default !== undefined && { default: field.default }) }]),
    ),
    ...(required.length > 0 && { required }),
    additionalProperties: false,
  };
}

/** The JSON Schema of project.json at the current schema version. */
export function projectJsonSchema(): Json {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: `Shorts Editor project.json (schema version ${SCHEMA_VERSION})`,
    ...ref("Project"),
    $defs: Object.fromEntries(Object.values(FIELD_TABLE).map((schema) => [schema.name, objectSchema(schema)])),
  };
}
