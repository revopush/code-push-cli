// Licensed under the MIT License.

import * as fs from "fs";

/** Top-level fields of a source map document. */
export type SourceMapFields = Record<string, unknown>;

/**
 * Structural fields of the source map spec. compose derives every one of them from the maps it merges, so a
 * packager value can only contradict what compose produced: a packager `sourceRoot`, for example, would be
 * re-applied on top of the source paths compose has already resolved against it.
 */
const STRUCTURAL_SOURCE_MAP_FIELDS: ReadonlySet<string> = new Set([
  "version",
  "file",
  "sourceRoot",
  "sources",
  "sourcesContent",
  "names",
  "mappings",
  "sections",
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
 * touching a structural field. Returns the names of the restored fields.
 */
export function restoreSourceMapFields(composedSourceMapPath: string, packagerFields: SourceMapFields): string[] {
  const metadataFields = Object.keys(packagerFields).filter((field) => !STRUCTURAL_SOURCE_MAP_FIELDS.has(field));
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
