import { FormatObject } from "../controllers/v2/types";

/**
 * Checks if a format of a specific type exists in the formats array.
 * Returns the format object if found, undefined otherwise.
 *
 * This function handles both simple formats (e.g., { type: "markdown" })
 * and complex formats with additional properties (e.g., { type: "screenshot", fullPage: true }).
 *
 * @param formats - Array of format objects
 * @param type - The format type to search for
 * @returns The format object if found, undefined otherwise
 */
export function hasFormatOfType<T extends FormatObject["type"]>(
  formats: FormatObject[] | undefined,
  type: T,
): Extract<FormatObject, { type: T }> | undefined {
  if (!formats) {
    return undefined;
  }

  const found = formats.find(f => f.type === type);
  return found as Extract<FormatObject, { type: T }> | undefined;
}
