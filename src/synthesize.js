import { isPlainObject } from "./utils.js";

const FORMAT_EXAMPLES = Object.freeze({
  date: "2030-01-01",
  "date-time": "2030-01-01T12:00:00Z",
  email: "agent@example.com",
  hostname: "example.com",
  ipv4: "192.0.2.1",
  time: "12:00:00Z",
  uri: "https://example.com/",
  url: "https://example.com/",
  uuid: "00000000-0000-4000-8000-000000000000",
});
const MAX_SYNTHESIZED_ITEMS = 100;
const MAX_SYNTHESIZED_LENGTH = 10_000;
const MAX_SCHEMA_DEPTH = 24;
const MAX_OBJECT_PROPERTIES = 200;

function firstDefined(...values) {
  return values.find((value) => value !== undefined);
}

function stringValue(schema) {
  const base = firstDefined(
    schema.examples?.[0],
    schema.example,
    schema.default,
    schema.const,
    schema.enum?.[0],
    FORMAT_EXAMPLES[schema.format],
    "example",
  );
  let result = String(base);
  const minimum = Number.isInteger(schema.minLength) ? schema.minLength : 0;
  if (minimum > MAX_SYNTHESIZED_LENGTH) {
    throw new Error(`minLength ${minimum} exceeds the synthesis limit of ${MAX_SYNTHESIZED_LENGTH}`);
  }
  while (result.length < minimum) result += "x";
  if (Number.isInteger(schema.maxLength)) result = result.slice(0, schema.maxLength);
  return result;
}

function numberValue(schema, integer) {
  let result = firstDefined(
    schema.examples?.[0],
    schema.example,
    schema.default,
    schema.const,
    schema.enum?.[0],
    schema.minimum,
    schema.exclusiveMinimum !== undefined ? schema.exclusiveMinimum + (integer ? 1 : 0.1) : undefined,
    1,
  );
  result = Number(result);
  if (!Number.isFinite(result)) result = 1;
  if (integer) result = Math.ceil(result);
  if (schema.maximum !== undefined) result = Math.min(result, schema.maximum);
  if (schema.exclusiveMaximum !== undefined && result >= schema.exclusiveMaximum) {
    result = schema.exclusiveMaximum - (integer ? 1 : 0.1);
  }
  return result;
}

export function synthesizeInput(schema = {}, seen = new Set()) {
  if (schema === true || schema === undefined) return {};
  if (schema === false) throw new Error("Cannot synthesize input for a false schema");
  if (!isPlainObject(schema)) throw new Error("Input schema must be an object");
  if (seen.has(schema)) throw new Error("Cannot synthesize a recursive in-memory schema");
  if (seen.size >= MAX_SCHEMA_DEPTH) throw new Error(`Input schema exceeds the depth limit of ${MAX_SCHEMA_DEPTH}`);
  seen.add(schema);

  if (schema.examples?.length) return structuredClone(schema.examples[0]);
  if (schema.example !== undefined) return structuredClone(schema.example);
  if (schema.default !== undefined) return structuredClone(schema.default);
  if (schema.const !== undefined) return structuredClone(schema.const);
  if (schema.enum?.length) return structuredClone(schema.enum[0]);
  if (schema.oneOf?.length) return synthesizeInput(schema.oneOf[0], seen);
  if (schema.anyOf?.length) return synthesizeInput(schema.anyOf[0], seen);
  if (schema.allOf?.length) {
    const objects = schema.allOf.map((part) => synthesizeInput(part, seen));
    if (objects.every(isPlainObject)) return Object.assign({}, ...objects);
    return objects[0];
  }

  const type = Array.isArray(schema.type)
    ? (schema.type.find((item) => item !== "null") ?? schema.type[0])
    : schema.type;
  let result;
  switch (type) {
    case "string":
      result = stringValue(schema);
      break;
    case "integer":
      result = numberValue(schema, true);
      break;
    case "number":
      result = numberValue(schema, false);
      break;
    case "boolean":
      result = false;
      break;
    case "null":
      result = null;
      break;
    case "array": {
      const count = schema.maxItems === 0 ? 0 : Math.max(1, schema.minItems ?? 0);
      if (!Number.isSafeInteger(count) || count > MAX_SYNTHESIZED_ITEMS) {
        throw new Error(`minItems ${count} exceeds the synthesis limit of ${MAX_SYNTHESIZED_ITEMS}`);
      }
      result = Array.from({ length: count }, () => synthesizeInput(schema.items ?? {}, new Set(seen)));
      break;
    }
    case "object":
    case undefined: {
      result = {};
      const properties = isPlainObject(schema.properties) ? schema.properties : {};
      if (Object.keys(properties).length > MAX_OBJECT_PROPERTIES) {
        throw new Error(`Input schema exceeds the property limit of ${MAX_OBJECT_PROPERTIES}`);
      }
      const required = new Set(schema.required ?? []);
      for (const [name, propertySchema] of Object.entries(properties)) {
        const hasSeed = propertySchema?.default !== undefined
          || propertySchema?.example !== undefined
          || propertySchema?.examples?.length
          || propertySchema?.const !== undefined;
        if (required.has(name) || hasSeed) {
          result[name] = synthesizeInput(propertySchema, new Set(seen));
        }
      }
      break;
    }
    default:
      throw new Error(`Unsupported schema type: ${type}`);
  }
  seen.delete(schema);
  return result;
}
