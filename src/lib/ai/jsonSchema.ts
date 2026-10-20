import { z } from "zod";

type JsonSchema = Record<string, unknown>;

/** Keywords Claude's structured outputs enforce (constrained decoding). */
const KEPT = new Set([
  "type",
  "enum",
  "const",
  "anyOf",
  "allOf",
  "$ref",
  "$defs",
  "properties",
  "required",
  "items",
  "description",
  "title",
  "format",
]);
const FORMATS = new Set([
  "date-time",
  "time",
  "date",
  "duration",
  "email",
  "hostname",
  "uri",
  "ipv4",
  "ipv6",
  "uuid",
]);

function transform(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(transform);
  if (!node || typeof node !== "object") return node;
  const input = { ...(node as JsonSchema) };
  delete input.$schema;
  if (input.oneOf && !input.anyOf) {
    input.anyOf = input.oneOf;
    delete input.oneOf;
  }
  if (input.format !== undefined && !FORMATS.has(String(input.format))) {
    input.description = [input.description, `format: ${input.format}`]
      .filter(Boolean)
      .join("\n");
    delete input.format;
  }

  const out: JsonSchema = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (key === "additionalProperties") continue;
    if (!KEPT.has(key)) {
      dropped.push(`${key}: ${JSON.stringify(value)}`);
      continue;
    }
    if (key === "properties" || key === "$defs") {
      out[key] = Object.fromEntries(
        Object.entries(value as JsonSchema).map(([k, v]) => [k, transform(v)]),
      );
    } else if (key === "items" || key === "anyOf" || key === "allOf") {
      out[key] = transform(value);
    } else {
      out[key] = value;
    }
  }
  if (out.type === "object") out.additionalProperties = false;
  if (dropped.length) {
    // Not enforced by the API; zod still checks them on our side.
    out.description = [out.description, `{${dropped.join(", ")}}`]
      .filter(Boolean)
      .join("\n\n");
  }
  return out;
}

/**
 * JSON schema for `output_config.format`. The SDK's zodOutputFormat helper
 * (0.135) turns `enum` into description text, so the model could answer
 * outside a fixed list; this keeps every keyword the API enforces and only
 * moves the unsupported ones (min/max, string lengths) into descriptions.
 */
export function toOutputSchema(schema: z.ZodType): JsonSchema {
  return transform(z.toJSONSchema(schema, { reused: "ref" })) as JsonSchema;
}
