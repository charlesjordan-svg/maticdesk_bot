// @ts-check
/**
 * Minimal JSON Schema validator covering exactly the subset the catalog uses:
 * object/string/integer, enum, required, additionalProperties:false, minimum.
 *
 * This is the enforcement point for the invariant in §5 - parameters are schema-constrained,
 * never freeform, so no model-supplied string can reach a Win32 call as an argument. Hand-rolled
 * rather than pulling in a validator: the subset is small enough to read in full and verify.
 */

/** @returns {string[]} error strings; empty means valid */
export function validateAgainstSchema(schema, value, path = "parameters") {
  const errors = [];
  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return [`${path} must be an object`];
    }
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${path}.${key} is required`);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(schema.properties ?? {}, key)) {
          errors.push(`${path}.${key} is not an allowed parameter`);
        }
      }
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key)) {
        errors.push(...validateAgainstSchema(sub, value[key], `${path}.${key}`));
      }
    }
    return errors;
  }
  if (schema.type === "string") {
    if (typeof value !== "string") return [`${path} must be a string`];
    if (schema.enum && !schema.enum.includes(value)) {
      return [`${path} must be one of: ${schema.enum.join(", ")} (got ${JSON.stringify(value)})`];
    }
    return [];
  }
  if (schema.type === "integer") {
    if (!Number.isInteger(value)) return [`${path} must be an integer`];
    if (schema.minimum !== undefined && value < schema.minimum) {
      return [`${path} must be >= ${schema.minimum}`];
    }
    return [];
  }
  if (schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) return [`${path} must be a number`];
    return [];
  }
  // An unknown type in the catalog is a catalog bug - fail closed, never fall through to allow.
  return [`${path}: unsupported schema type ${JSON.stringify(schema.type)}`];
}
