import * as fs from "fs";

// Fields tied to the bundle layout: a packager value would contradict the composed map (e.g. an ignore list
// indexing the packager's sources).
const POSITIONAL_FIELDS: ReadonlySet<string> = new Set([
  "version",
  "file",
  "sourceRoot",
  "sources",
  "sourcesContent",
  "names",
  "mappings",
  "ignoreList",
  "sections",
  "x_google_ignoreList",
  "x_facebook_sources",
  "x_facebook_offsets",
  "x_facebook_segments",
  "x_hermes_function_offsets",
]);

/**
 * compose-source-maps.js drops fields it doesn't know, such as `debugId`. Copies the packager map's non-positional
 * fields the composed map lacks into it and returns their names.
 */
export async function restoreSourceMapMetadata(
  composedSourceMap: string,
  packagerSourceMap: Record<string, unknown>
): Promise<string[]> {
  const metadataFields = Object.keys(packagerSourceMap).filter((field) => !POSITIONAL_FIELDS.has(field));
  // Avoid parsing the (possibly huge) composed map when there is nothing to restore
  if (metadataFields.length === 0) return [];

  const composed = JSON.parse(await fs.promises.readFile(composedSourceMap, "utf8"));
  const restoredFields = metadataFields.filter((field) => !Object.hasOwn(composed, field));
  if (restoredFields.length === 0) return [];

  for (const field of restoredFields) {
    composed[field] = packagerSourceMap[field];
  }
  await fs.promises.writeFile(composedSourceMap, JSON.stringify(composed));
  return restoredFields;
}
