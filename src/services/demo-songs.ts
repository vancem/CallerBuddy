/**
 * Optional first-run demo songs (Saints singing call + Cotton Eyed Joe patter).
 *
 * Assets live under `public/demo/` and are fetched only when the user accepts
 * the empty-folder offer — they are not bundled into the JS app shell.
 */

import {
  listDirectory,
  writeBinaryFile,
  writeTextFile,
} from "./file-system-service.js";
import { log } from "./logger.js";

/** Files copied into an empty CallerBuddyRoot when the user opts in. */
export const DEMO_SONG_FILES = [
  "When the Saints Go Marching In.mp3",
  "When the Saints Go Marching In.md",
  "Cotton Eyed Joe.mp3",
] as const;

/** True when the directory has no files or subfolders. */
export async function isDirectoryEmpty(
  dirHandle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const entries = await listDirectory(dirHandle);
  return entries.length === 0;
}

/**
 * Download demo assets from the site and write them into `dirHandle`.
 * Requires network access (online-only).
 */
export async function installDemoSongs(
  dirHandle: FileSystemDirectoryHandle,
): Promise<void> {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;

  for (const name of DEMO_SONG_FILES) {
    const url = `${base}demo/${encodeURIComponent(name)}`;
    log.info(`installDemoSongs: fetching ${url}…`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Could not download demo file "${name}" (${res.status}). ` +
          "Check your network connection and try again.",
      );
    }
    if (name.endsWith(".md")) {
      const text = await res.text();
      await writeTextFile(dirHandle, name, text);
    } else {
      const data = await res.arrayBuffer();
      await writeBinaryFile(dirHandle, name, data);
    }
    log.info(`installDemoSongs: wrote "${name}"`);
  }
}
