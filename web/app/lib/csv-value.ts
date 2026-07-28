const FORMULA_PREFIX_AFTER_CONTROL_WHITESPACE =
  /^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@]/u;

/**
 * Encode one RFC 4180-style CSV field while neutralizing spreadsheet formulas.
 *
 * Spreadsheet applications may ignore tabs and other control whitespace before
 * a formula marker, so string values are prefixed with an apostrophe whenever
 * their first meaningful character is =, +, -, or @. Numeric values remain
 * numeric, including legitimate negative measurements.
 */
export function csvValue(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (
    typeof value === "string" &&
    FORMULA_PREFIX_AFTER_CONTROL_WHITESPACE.test(text)
  ) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}
