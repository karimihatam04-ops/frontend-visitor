import path from "path";

export const HTML_CACHE_CONTROL = "no-store, max-age=0, must-revalidate";
export const ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";

export function staticCacheControl(filePath: string, isProduction: boolean): string {
  if (!isProduction || path.basename(filePath).toLowerCase() === "index.html") {
    return HTML_CACHE_CONTROL;
  }
  return ASSET_CACHE_CONTROL;
}
