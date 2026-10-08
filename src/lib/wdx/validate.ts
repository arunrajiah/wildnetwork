import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "./detection-event.schema.json";
import statusSchema from "./device-status.schema.json";
import type { WdxEvent } from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateFn = ajv.compile<WdxEvent>(schema);
const validateStatusFn = ajv.compile(statusSchema);

export interface ValidationResult {
  ok: boolean;
  errors?: string[];
}

export function validateWdx(input: unknown): ValidationResult {
  if (validateFn(input)) return { ok: true };
  const errors = (validateFn.errors ?? []).map(
    (e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`,
  );
  return { ok: false, errors };
}

/** WDX device-status record (health report). */
export function validateStatus(input: unknown): ValidationResult {
  if (validateStatusFn(input)) return { ok: true };
  return { ok: false, errors: (validateStatusFn.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`) };
}

/** Parse a request body that is either one JSON object, a JSON array, or NDJSON. */
export function parseEventsBody(text: string): unknown[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) return JSON.parse(trimmed) as unknown[];
  if (trimmed.startsWith("{") && !trimmed.includes("\n{")) {
    return [JSON.parse(trimmed)];
  }
  return trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as unknown);
}
