import * as fs from "fs";

// Fields that index into `sources`/`mappings` or describe the bundle layout. compose rewrites them against the
// composed map, so a packager value would contradict it (an ignore list would point at the packager's sources).
// Sources: the source map spec, metro-source-map's composeSourceMaps and react-native's compose-source-maps.js.
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
 * compose-source-maps.js keeps only the fields it knows, dropping metadata such as the `debugId` crash reporters use
 * to match a bundle to its source map. Copies the packager map's other top-level fields into the composed map without
 * overwriting anything compose produced. Returns the restored field names.
 */
export function restoreSourceMapMetadata(composedSourceMap: string, packagerSourceMap: Record<string, unknown>): string[] {
  const metadataFields = Object.keys(packagerSourceMap).filter((field) => !POSITIONAL_FIELDS.has(field));
  // Skips parsing the composed map, which can be hundreds of megabytes, when there is nothing to restore
  if (metadataFields.length === 0) return [];

  const composed = JSON.parse(fs.readFileSync(composedSourceMap, "utf8"));
  const restoredFields = metadataFields.filter((field) => !Object.hasOwn(composed, field));
  if (restoredFields.length === 0) return [];

  for (const field of restoredFields) {
    composed[field] = packagerSourceMap[field];
  }
  fs.writeFileSync(composedSourceMap, JSON.stringify(composed));
  return restoredFields;
}
