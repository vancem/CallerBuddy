/**
 * Normalize playlist paths to be CallerBuddyRoot-relative.
 * Android's FileSystemDirectoryHandle.resolve() can return URI-encoded
 * platform paths (e.g. document/primary%3ACallerBuddy%2Fpatter/...).
 */

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Strip platform-specific prefixes and return a path relative to CallerBuddyRoot.
 * Examples:
 *   "patter/Song.mp3" → "patter/Song.mp3"
 *   "document/primary:CallerBuddy/patter/Song.mp3" → "patter/Song.mp3"
 */
export function normalizePlaylistRelPath(
  rawPath: string,
  rootFolderName: string,
): string {
  if (!rawPath) return rawPath;

  let path = rawPath.replace(/\\/g, "/");
  path = decodePathSegment(path);

  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return rawPath;

  const rootLower = rootFolderName.toLowerCase();
  let rootIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].toLowerCase();
    if (p === rootLower || p.endsWith(":" + rootLower)) {
      rootIdx = i;
      break;
    }
  }

  if (rootIdx >= 0 && rootIdx < parts.length - 1) {
    return parts.slice(rootIdx + 1).join("/");
  }

  // Already a simple relative path (no platform URI junk).
  if (!path.includes(":") && parts[0] !== "document") {
    return parts.join("/");
  }

  return parts[parts.length - 1];
}

export function normalizePlaylistRelPaths(
  paths: string[],
  rootFolderName: string,
): string[] {
  return paths.map((p) => normalizePlaylistRelPath(p, rootFolderName));
}
