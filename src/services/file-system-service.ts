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

/** Directory-picker id for choosing/changing CallerBuddyRoot. */
export const DIR_PICKER_ROOT_ID = "callerbuddy-root";
/** Directory-picker id for importing a song folder (separate browser history). */
export const DIR_PICKER_IMPORT_ID = "callerbuddy-import";

// ---------------------------------------------------------------------------
// IndexedDB helpers for persisting the FileSystemDirectoryHandle
// ---------------------------------------------------------------------------

const IDB_NAME = "callerbuddy";
const IDB_VERSION = 1;
const IDB_STORE = "handles";
const IDB_KEY = "root";
const SETTINGS_JSON = "CallerBuddySettings.json";

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

function deleteCallerBuddyIdb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(IDB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    // Other tabs/connections can block; resolve anyway so reset can reload.
    req.onblocked = () => {
      log.warn(
        "deleteCallerBuddyIdb: blocked by another connection; continuing (reload will finish cleanup)",
      );
      resolve();
    };
  });
}

/**
 * Clear origin-scoped browser state and reload so the next session matches
 * first launch (welcome / pick folder). Deletes CallerBuddySettings.json when
 * a root handle is available; leaves song files untouched.
 */
export async function resetCallerBuddyBrowserState(
  rootHandle?: FileSystemDirectoryHandle | null,
): Promise<void> {
  log.info("resetCallerBuddyBrowserState: starting…");

  let handle = rootHandle ?? null;
  if (!handle) {
    handle = await loadRootHandle();
  }
  if (handle) {
    try {
      if (await ensurePermission(handle)) {
        if (await fileExists(handle, SETTINGS_JSON)) {
          await deleteFile(handle, SETTINGS_JSON);
          log.info("resetCallerBuddyBrowserState: deleted CallerBuddySettings.json");
        } else {
          log.info("resetCallerBuddyBrowserState: no CallerBuddySettings.json present");
        }
      } else {
        log.warn(
          "resetCallerBuddyBrowserState: no permission to delete CallerBuddySettings.json",
        );
      }
    } catch (err) {
      log.warn(
        "resetCallerBuddyBrowserState: could not delete CallerBuddySettings.json:",
        err,
      );
    }
  } else {
    log.info("resetCallerBuddyBrowserState: no root handle; skipping settings file");
  }

  log.info("resetCallerBuddyBrowserState: clearing origin storage…");

  if ("serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    log.info(`resetCallerBuddyBrowserState: unregistered ${regs.length} service worker(s)`);
  }

  if ("caches" in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    log.info(`resetCallerBuddyBrowserState: cleared ${keys.length} cache(s)`);
  }

  try {
    await Promise.race([
      deleteCallerBuddyIdb(),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);
    log.info("resetCallerBuddyBrowserState: IndexedDB delete requested");
  } catch (err) {
    log.warn("resetCallerBuddyBrowserState: IndexedDB delete failed:", err);
  }

  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch (err) {
    log.warn("resetCallerBuddyBrowserState: storage clear failed:", err);
  }

  log.info("resetCallerBuddyBrowserState: reloading…");
  location.reload();
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
 * Write a binary file to the directory, creating it if necessary.
 * Requires readwrite permission on the handle.
 */
export async function writeBinaryFile(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  contents: BufferSource,
): Promise<void> {
  log.debug(
    `writeBinaryFile: writing "${filename}" (${contents.byteLength} bytes)…`,
  );
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(contents);
  await writable.close();
  log.debug(`writeBinaryFile: "${filename}" written successfully`);
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

/**
 * Return the file's lastModified timestamp (ms since epoch), or null if missing.
 */
export async function getFileLastModified(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
): Promise<number | null> {
  try {
    const fileHandle = await dirHandle.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return file.lastModified;
  } catch {
    return null;
  }
}

/**
 * Delete a file from the directory.
 * Requires readwrite permission on the handle.
 */
export async function deleteFile(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
): Promise<void> {
  log.debug(`deleteFile: removing "${filename}" from "${dirHandle.name}"…`);
  await dirHandle.removeEntry(filename);
  log.debug(`deleteFile: "${filename}" removed`);
}

/**
 * Rename a file within the same directory.
 * Uses FileSystemFileHandle.move when available; otherwise copy + delete.
 */
export async function renameFile(
  dirHandle: FileSystemDirectoryHandle,
  oldName: string,
  newName: string,
): Promise<void> {
  if (oldName === newName) return;
  log.debug(`renameFile: "${oldName}" → "${newName}" in "${dirHandle.name}"…`);
  const fileHandle = await dirHandle.getFileHandle(oldName);
  const movable = fileHandle as FileSystemFileHandle & {
    move?: (name: string) => Promise<void>;
  };
  if (typeof movable.move === "function") {
    await movable.move(newName);
    log.debug(`renameFile: moved via FileSystemFileHandle.move`);
    return;
  }

  const file = await fileHandle.getFile();
  const data = await file.arrayBuffer();
  const newHandle = await dirHandle.getFileHandle(newName, { create: true });
  const writable = await newHandle.createWritable();
  await writable.write(data);
  await writable.close();
  await dirHandle.removeEntry(oldName);
  log.debug(`renameFile: copied then removed old file`);
}
