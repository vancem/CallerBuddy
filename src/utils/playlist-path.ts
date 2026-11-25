/**
 * Normalize playlist paths to be CallerBuddyRoot-relative.
 * Android's FileSystemDirectoryHandle.resolve() can return URI-encoded
 * platform paths (e.g. document/primary%3ACallerBuddy%2Fpatter/...).
 */

/** Decode a File System Access path segment when Android returns URI-encoded names. */
export function decodePathSegment(segment: string): string {
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

function normalizeSlashes(path: string): string {
  return path.replace(/\\/g, "/").trim();
}

/**
 * CallerBuddyRoot-relative path for a song shown in the playlist editor.
 * Uses playlistRelPath when the row already has one; otherwise joins the
 * folder the editor is showing with the audio filename.
 * Returns null when the folder path is unknown and the song has no path.
 */
export function editorSongPlaylistKey(
  song: { musicFile: string; playlistRelPath?: string },
  folderRelPath: string | null,
): string | null {
  const own = normalizeSlashes(song.playlistRelPath ?? "");
  if (own) return own.toLowerCase();
  if (folderRelPath === null) return null;
  const file = normalizeSlashes(song.musicFile).replace(/^\/+/, "");
  if (!file) return null;
  const folder = normalizeSlashes(folderRelPath).replace(/^\/+|\/+$/g, "");
  return (folder ? `${folder}/${file}` : file).toLowerCase();
}

/** True when this editor row is already a member of the playlist. */
export function isEditorSongOnPlaylist(
  song: { musicFile: string; playlistRelPath?: string },
  folderRelPath: string | null,
  playlistRelPaths: Iterable<string>,
): boolean {
  const key = editorSongPlaylistKey(song, folderRelPath);
  if (!key) return false;
  for (const raw of playlistRelPaths) {
    const path = normalizeSlashes(raw).toLowerCase();
    if (path && path === key) return true;
  }
  return false;
}

/** Folder handle identity used to match a library row to a restored playlist copy. */
export interface PlaylistDirHandle {
  name: string;
}

/**
 * True when a library row is the same song as a playlist entry.
 * Restored playlist rows are copies, so object identity is not enough.
 * Path matching needs the open folder's root-relative path, which comes from
 * FileSystemDirectoryHandle.resolve / isSameEntry and can hang on cloud drives.
 * The folder-handle check still highlights those rows while that lookup is pending.
 */
export function songMatchesPlaylistEntry(
  song: { musicFile: string; playlistRelPath?: string; dirHandle?: PlaylistDirHandle | null },
  entry: { musicFile: string; playlistRelPath?: string; dirHandle?: PlaylistDirHandle | null },
  folderRelPath: string | null,
): boolean {
  if (song === entry) return true;
  if (isEditorSongOnPlaylist(song, folderRelPath, [entry.playlistRelPath ?? ""])) {
    return true;
  }
  const songFile = song.musicFile.trim().toLowerCase();
  const entryFile = entry.musicFile.trim().toLowerCase();
  if (!songFile || songFile !== entryFile) return false;
  const songDir = song.dirHandle;
  const entryDir = entry.dirHandle;
  if (!songDir || !entryDir) return false;
  if (songDir === entryDir) return true;
  if (folderRelPath === null && songDir.name === entryDir.name) return true;
  return false;
}
