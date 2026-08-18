import { existsSync } from "node:fs";
import path from "node:path";

/**
 * The marketing page is a server component, so expected local media can be
 * checked before rendering an Image request. This keeps optional captures
 * quiet when they have not been supplied yet.
 */
export function hasLandingMedia(mediaPath: string): boolean {
  if (!mediaPath.startsWith("/media/")) return false;
  return existsSync(path.join(process.cwd(), "public", mediaPath.slice(1)));
}
