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
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
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
  const perm = await handle.queryPermission({ mode: "readwrite" });
  if (perm === "granted") return true;
  const result = await handle.requestPermission({ mode: "readwrite" });
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
  const entries: DirEntry[] = [];
  for await (const entry of handle.values()) {
    entries.push({ name: entry.name, kind: entry.kind });
  }
  entries.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
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
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
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
