import * as fs from "fs";

// Fields tied to the bundle layout, which compose rewrites; packager values would point at the wrong sources
const POSITIONAL_FIELDS = new Set([
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

/** compose-source-maps.js drops fields it doesn't know, such as `debugId`. Copies them back; returns their names. */
export async function restoreSourceMapMetadata(
  composedSourceMap: string,
  packagerSourceMap: Record<string, unknown>
): Promise<string[]> {
  const fields = Object.keys(packagerSourceMap).filter((field) => !POSITIONAL_FIELDS.has(field));
  // Skip reading the (possibly huge) composed map when there is nothing to copy
  if (fields.length === 0) return [];

  const composed = JSON.parse(await fs.promises.readFile(composedSourceMap, "utf8"));
  const restored = fields.filter((field) => !Object.hasOwn(composed, field));
  if (restored.length === 0) return [];

  for (const field of restored) composed[field] = packagerSourceMap[field];
  await fs.promises.writeFile(composedSourceMap, JSON.stringify(composed));
  return restored;
}
