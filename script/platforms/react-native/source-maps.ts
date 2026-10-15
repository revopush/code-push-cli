import * as fs from "fs";
import * as path from "path";
import * as cli from "../../types/cli";
import { getXcodeDotEnvValue } from "../ios/xcode";

export interface SourceMapPaths {
  /** Written by Metro */
  packager: string;
  /** Released; differs from the packager map only for Hermes on Android */
  final: string;
}

/** sourcemapOutput is a folder or the .map file itself; file names match RN's builds */
export function getSourceMapPaths(
  { platform, podFile }: cli.NativeProject,
  bundleName: string,
  sourcemapOutput: string,
  isHermes: boolean
): SourceMapPaths {
  if (sourcemapOutput.endsWith(".map")) {
    return { packager: sourcemapOutput, final: sourcemapOutput };
  }
  if (platform === "android") {
    const final = path.join(sourcemapOutput, bundleName + ".map");
    // With Hermes, Metro's map is the "packager" one (BundleHermesCTask)
    const packager = isHermes ? path.join(sourcemapOutput, bundleName + ".packager.map") : final;
    return { packager, final };
  }
  // Same name as react-native-xcode.sh, since it ends up in the bundle's sourceMappingURL
  const sourceMapFile = getXcodeDotEnvValue("SOURCEMAP_FILE", podFile);
  const sourceMap = path.join(sourcemapOutput, sourceMapFile ? path.basename(sourceMapFile) : bundleName + ".map");
  return { packager: sourceMap, final: sourceMap };
}

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
