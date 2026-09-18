// Licensed under the MIT License.

import * as fs from "fs";

/** Top-level fields of a source map document. */
export type SourceMapFields = Record<string, unknown>;

/**
 * Fields whose meaning is positional - they index into `sources`/`mappings` or describe the bundle's layout.
 * compose rewrites all of them against the composed map, so a packager value can only contradict the result:
 * `sourceRoot` would be re-applied on top of paths compose already resolved against it, and an ignore list
 * would point at the packager's source indices rather than the composed map's.
 *
 * Everything else is a free-standing label (a debug id, a build id, an arbitrary vendor blob) and is safe to
 * carry over. Sources: the source map spec for the standard names, metro-source-map's composeSourceMaps and
 * react-native's compose-source-maps.js for the `x_` extensions.
 */
const POSITIONAL_SOURCE_MAP_FIELDS: ReadonlySet<string> = new Set([
  // Source map spec (both the plain and the indexed `sections` form).
  "version",
  "file",
  "sourceRoot",
  "sources",
  "sourcesContent",
  "names",
  "mappings",
  "ignoreList",
  "sections",
  // metro / Hermes / RAM bundle extensions.
  "x_google_ignoreList",
  "x_facebook_sources",
  "x_facebook_offsets",
  "x_facebook_segments",
  "x_hermes_function_offsets",
]);

export function readSourceMapFields(sourceMapPath: string): SourceMapFields {
  const sourceMap: unknown = JSON.parse(fs.readFileSync(sourceMapPath, "utf8"));
  if (typeof sourceMap !== "object" || sourceMap === null || Array.isArray(sourceMap)) {
    throw new Error(`${sourceMapPath} is not a source map object`);
  }
  return sourceMap as SourceMapFields;
}

/**
 * react-native's compose-source-maps.js builds the composed map out of the structural fields it knows about,
 * so metadata a custom Metro serializer added to the packager map is dropped - most notably the debug id that
 * crash reporters use to match a shipped bundle to its uploaded source map.
 *
 * Copies that metadata back into the composed map, never overwriting a value compose itself produced and never
 * touching a positional field. Returns the names of the restored fields.
 */
export function restoreSourceMapFields(composedSourceMapPath: string, packagerFields: SourceMapFields): string[] {
  const metadataFields = Object.keys(packagerFields).filter((field) => !POSITIONAL_SOURCE_MAP_FIELDS.has(field));
  if (metadataFields.length === 0) {
    // Nothing worth restoring, so do not pay for parsing the composed map at all - it can be hundreds of megabytes.
    return [];
  }

  const composedFields = readSourceMapFields(composedSourceMapPath);
  const restoredFields = metadataFields.filter((field) => !Object.hasOwn(composedFields, field));

  if (restoredFields.length === 0) {
    return [];
  }

  for (const field of restoredFields) {
    composedFields[field] = packagerFields[field];
  }

  fs.writeFileSync(composedSourceMapPath, JSON.stringify(composedFields));
  return restoredFields;
}
