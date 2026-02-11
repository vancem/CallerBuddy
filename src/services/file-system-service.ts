/**
 * Wraps the File System Access API for CallerBuddyRoot access.
 *
 * Responsibilities:
 *  - Store/retrieve the directory handle via IndexedDB (persistent across sessions)
 *  - Read and write files within CallerBuddyRoot
 *  - List directory contents
 *
 * See CallerBuddySpec.md §2 "Core Architecture" and BACKLOG.md design decisions
 * (File System Access API, OPFS caching).
 */

import { log, assert } from "./logger.js";

// ---------------------------------------------------------------------------
// IndexedDB helpers for persisting the FileSystemDirectoryHandle
// ---------------------------------------------------------------------------

const IDB_NAME = "callerbuddy";
const IDB_VERSION = 1;
const IDB_STORE = "handles";
const IDB_KEY = "root";

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Persist the root directory handle so the user doesn't have to re-pick. */
export async function storeRootHandle(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  log.debug("storeRootHandle: opening IndexedDB…");
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    tx.oncomplete = () => {
      db.close();
      log.debug("storeRootHandle: handle persisted");
      resolve();
    };
    tx.onerror = () => {
      db.close();
      log.error("storeRootHandle: IndexedDB transaction error:", tx.error);
      reject(tx.error);
    };
  });
}

/** Retrieve the previously stored root handle, or null if none. */
export async function loadRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openIDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as FileSystemDirectoryHandle) ?? null);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch (err) {
    log.warn("Could not load stored root handle:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

/**
 * Ensure we have readwrite permission on the handle.
 * Returns true if permission was granted, false otherwise.
 * A user gesture is required for requestPermission; call this in response to
 * a click or similar.
 */
export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  log.debug(`ensurePermission: querying permission on "${handle.name}"…`);
  const perm = await handle.queryPermission({ mode: "readwrite" });
  log.debug(`ensurePermission: queryPermission returned "${perm}"`);
  if (perm === "granted") return true;
  log.info(`ensurePermission: requesting readwrite permission…`);
  const result = await handle.requestPermission({ mode: "readwrite" });
  log.info(`ensurePermission: requestPermission returned "${result}"`);
  return result === "granted";
}

// ---------------------------------------------------------------------------
// File I/O within CallerBuddyRoot
// ---------------------------------------------------------------------------

export interface DirEntry {
  name: string;
  kind: "file" | "directory";
}

/** List immediate children of a directory, sorted by name (case-insensitive). */
export async function listDirectory(
  handle: FileSystemDirectoryHandle,
): Promise<DirEntry[]> {
  log.debug(`listDirectory: enumerating "${handle.name}"…`);
  const entries: DirEntry[] = [];
  for await (const entry of handle.values()) {
    entries.push({ name: entry.name, kind: entry.kind });
  }
  entries.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
  log.debug(
    `listDirectory: found ${entries.length} entries ` +
      `(${entries.filter((e) => e.kind === "file").length} files, ` +
      `${entries.filter((e) => e.kind === "directory").length} dirs)`,
  );
  return entries;
}

/** Read a text file from the directory. Returns the file contents. */
export async function readTextFile(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
): Promise<string> {
  const fileHandle = await dirHandle.getFileHandle(filename);
  const file = await fileHandle.getFile();
  return file.text();
}

/** Read a binary file from the directory. Returns an ArrayBuffer. */
export async function readBinaryFile(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
): Promise<ArrayBuffer> {
  const fileHandle = await dirHandle.getFileHandle(filename);
  const file = await fileHandle.getFile();
  return file.arrayBuffer();
}

/**
 * Write a text file to the directory, creating it if necessary.
 * Requires readwrite permission on the handle.
 */
export async function writeTextFile(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  contents: string,
): Promise<void> {
  assert(typeof contents === "string", "writeTextFile: contents must be string");
  log.debug(`writeTextFile: writing "${filename}" (${contents.length} chars)…`);
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  log.debug(`writeTextFile: got file handle, creating writable…`);
  const writable = await fileHandle.createWritable();
  log.debug(`writeTextFile: writable created, writing data…`);
  await writable.write(contents);
  log.debug(`writeTextFile: data written, closing…`);
  await writable.close();
  log.debug(`writeTextFile: "${filename}" written successfully`);
}

/**
 * Check whether a file exists in the directory.
 * Returns true if the file exists, false otherwise.
 */
export async function fileExists(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
): Promise<boolean> {
  try {
    await dirHandle.getFileHandle(filename);
    return true;
  } catch {
    return false;
  }
}
