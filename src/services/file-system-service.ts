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

/** Per-step deadline for reset. File System calls are not cancellable. */
const RESET_STEP_MS = 2000;
/** Startup probe for IndexedDB load and queryPermission (no user dialog). */
export const HANDLE_PROBE_MS = 3000;
/** Settings + playlist restore. A normal folder finishes well inside this. */
export const ACTIVATE_IO_MS = 20_000;

/** Shown on Welcome when the stored folder handle does not answer. */
export const SAVED_FOLDER_NOTICE =
  "The saved folder did not respond. Choose your CallerBuddySongs folder again.";

export type ResetBrowserStateResult = "reloaded" | "needs-manual";

/**
 * Reload after a successful reset.
 * An object method so tests can replace it: jsdom's location.reload cannot be redefined.
 */
export const resetNavigation = {
  reload(): void {
    location.reload();
  },
};

export class DeadlineError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "DeadlineError";
  }
}

/**
 * Resolve or reject `promise` within `ms`. The underlying work keeps running;
 * callers must not depend on it after a timeout.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new DeadlineError(label, ms));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Connections this page opened. Closed before deleteDatabase so we are not the blocker. */
const openDatabases = new Set<IDBDatabase>();
/** Bumped when connections are dropped so a late open() closes itself. */
let openGeneration = 0;

function rememberDb(db: IDBDatabase, generation: number): boolean {
  if (generation !== openGeneration) {
    db.close();
    return false;
  }
  db.onversionchange = () => {
    db.close();
    openDatabases.delete(db);
  };
  openDatabases.add(db);
  return true;
}

function releaseDb(db: IDBDatabase): void {
  openDatabases.delete(db);
  try {
    db.close();
  } catch (err) {
    log.warn("releaseDb:", err);
  }
}

function closeTrackedDatabases(): void {
  openGeneration += 1;
  for (const db of openDatabases) {
    try {
      db.close();
    } catch (err) {
      log.warn("closeTrackedDatabases:", err);
    }
  }
  openDatabases.clear();
}

function openIDB(): Promise<IDBDatabase> {
  const generation = openGeneration;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (!rememberDb(db, generation)) {
        reject(new Error("IndexedDB connection closed"));
        return;
      }
      resolve(db);
    };
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
      releaseDb(db);
      log.debug("storeRootHandle: handle persisted");
      resolve();
    };
    tx.onerror = () => {
      releaseDb(db);
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
        releaseDb(db);
        resolve((req.result as FileSystemDirectoryHandle) ?? null);
      };
      req.onerror = () => {
        releaseDb(db);
        reject(req.error);
      };
    });
  } catch (err) {
    log.warn("Could not load stored root handle:", err);
    return null;
  }
}

/**
 * Drop the stored root handle without touching the folder.
 * Best-effort: a wedged IndexedDB must not hang the caller.
 */
export async function forgetStoredRootHandle(): Promise<void> {
  try {
    await withTimeout(deleteStoredRootKey(), HANDLE_PROBE_MS, "forgetStoredRootHandle");
    log.info("forgetStoredRootHandle: removed stored root handle");
  } catch (err) {
    log.warn("forgetStoredRootHandle: could not remove stored root handle:", err);
  }
}

function deleteStoredRootKey(): Promise<void> {
  return openIDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).delete(IDB_KEY);
        tx.oncomplete = () => {
          releaseDb(db);
          resolve();
        };
        tx.onerror = () => {
          releaseDb(db);
          reject(tx.error);
        };
      }),
  );
}

/**
 * Delete CallerBuddySettings.json only when permission is already granted.
 * Never calls requestPermission — that can sit on a hidden prompt or never return.
 */
async function tryDeleteSettingsFile(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const perm = await handle.queryPermission({ mode: "readwrite" });
  log.info(`resetCallerBuddyBrowserState: queryPermission returned "${perm}"`);
  if (perm !== "granted") {
    log.info(
      "resetCallerBuddyBrowserState: permission not already granted; skipping settings file",
    );
    return;
  }
  if (await fileExists(handle, SETTINGS_JSON)) {
    await deleteFile(handle, SETTINGS_JSON);
    log.info("resetCallerBuddyBrowserState: deleted CallerBuddySettings.json");
  } else {
    log.info("resetCallerBuddyBrowserState: no CallerBuddySettings.json present");
  }
}

async function clearServiceWorkers(stepMs: number): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  try {
    await withTimeout(
      (async () => {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        log.info(
          `resetCallerBuddyBrowserState: unregistered ${regs.length} service worker(s)`,
        );
      })(),
      stepMs,
      "unregister service workers",
    );
  } catch (err) {
    log.warn("resetCallerBuddyBrowserState: service worker unregister failed:", err);
  }
}

async function clearCaches(stepMs: number): Promise<void> {
  if (!("caches" in window)) return;
  try {
    await withTimeout(
      (async () => {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        log.info(`resetCallerBuddyBrowserState: cleared ${keys.length} cache(s)`);
      })(),
      stepMs,
      "clear caches",
    );
  } catch (err) {
    log.warn("resetCallerBuddyBrowserState: cache clear failed:", err);
  }
}

async function callerBuddyDatabaseExists(): Promise<boolean> {
  const factory = indexedDB as IDBFactory & {
    databases?: () => Promise<Array<{ name?: string }>>;
  };
  if (typeof factory.databases !== "function") return true;
  const rows = await factory.databases();
  return rows.some((row) => row.name === IDB_NAME);
}

/**
 * Delete the CallerBuddy IndexedDB. `onsuccess` means it is gone.
 * A blocked delete counts only when `databases()` no longer lists it.
 * If it is still there when the deadline hits, the caller must not reload.
 */
function deleteCallerBuddyDatabase(stepMs: number): Promise<boolean> {
  closeTrackedDatabases();
  return new Promise((resolve) => {
    const pending = {
      settled: false,
      timer: undefined as ReturnType<typeof setTimeout> | undefined,
    };
    const finish = (ok: boolean) => {
      if (pending.settled) return;
      pending.settled = true;
      clearTimeout(pending.timer);
      resolve(ok);
    };
    pending.timer = setTimeout(() => {
      void callerBuddyDatabaseExists().then(
        (exists) => finish(!exists),
        (err) => {
          log.warn("resetCallerBuddyBrowserState: could not list IndexedDB:", err);
          finish(false);
        },
      );
    }, stepMs);

    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.deleteDatabase(IDB_NAME);
    } catch (err) {
      log.warn("resetCallerBuddyBrowserState: deleteDatabase threw:", err);
      finish(false);
      return;
    }
    req.onsuccess = () => {
      log.info("resetCallerBuddyBrowserState: IndexedDB deleted");
      finish(true);
    };
    req.onerror = () => {
      log.warn("resetCallerBuddyBrowserState: IndexedDB delete failed:", req.error);
      finish(false);
    };
    req.onblocked = () => {
      log.warn(
        "resetCallerBuddyBrowserState: IndexedDB delete blocked; waiting for the deadline",
      );
      void callerBuddyDatabaseExists().then(
        (exists) => {
          if (!exists) finish(true);
        },
        () => {
          /* Deadline decides. */
        },
      );
    };
  });
}

/**
 * Clear origin-scoped browser state and reload so the next session matches
 * first launch (welcome / pick folder). Song files are never deleted.
 *
 * Storage is cleared without waiting on the folder handle. Deleting
 * CallerBuddySettings.json is best-effort and only runs when permission is
 * already granted; a handle that never answers cannot block the reload.
 * Returns "needs-manual" when IndexedDB itself cannot be deleted.
 */
export async function resetCallerBuddyBrowserState(
  rootHandle?: FileSystemDirectoryHandle | null,
): Promise<ResetBrowserStateResult> {
  log.info("resetCallerBuddyBrowserState: starting…");
  const stepMs = RESET_STEP_MS;

  let handle = rootHandle ?? null;
  if (!handle) {
    try {
      handle = await withTimeout(loadRootHandle(), stepMs, "loadRootHandle");
    } catch (err) {
      log.warn("resetCallerBuddyBrowserState: could not load stored handle:", err);
      handle = null;
    }
  }

  const settingsAttempt = handle
    ? withTimeout(
        tryDeleteSettingsFile(handle),
        stepMs,
        "delete CallerBuddySettings.json",
      ).catch((err) => {
        log.warn(
          "resetCallerBuddyBrowserState: could not delete CallerBuddySettings.json:",
          err,
        );
      })
    : Promise.resolve();
  if (!handle) {
    log.info("resetCallerBuddyBrowserState: no root handle; skipping settings file");
  }

  log.info("resetCallerBuddyBrowserState: clearing origin storage…");
  await clearServiceWorkers(stepMs);
  await clearCaches(stepMs);
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch (err) {
    log.warn("resetCallerBuddyBrowserState: storage clear failed:", err);
  }

  const deleted = await deleteCallerBuddyDatabase(stepMs);
  if (!deleted) {
    log.warn(
      "resetCallerBuddyBrowserState: IndexedDB still present; manual clear required",
    );
    return "needs-manual";
  }

  try {
    await settingsAttempt;
  } catch (err) {
    log.warn(
      "resetCallerBuddyBrowserState: settings delete failed after storage clear:",
      err,
    );
  }

  log.info("resetCallerBuddyBrowserState: reloading…");
  resetNavigation.reload();
  return "reloaded";
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
 * Append text to a file in the directory, creating it if necessary.
 * Does not rewrite bytes already in the file.
 * Requires readwrite permission on the handle.
 */
export async function appendTextFile(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  contents: string,
): Promise<void> {
  assert(typeof contents === "string", "appendTextFile: contents must be string");
  log.debug(`appendTextFile: appending "${filename}" (${contents.length} chars)…`);
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const existing = await fileHandle.getFile();
  const writable = await fileHandle.createWritable({ keepExistingData: true });
  await writable.seek(existing.size);
  await writable.write(contents);
  await writable.close();
  log.debug(`appendTextFile: "${filename}" appended successfully`);
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

/** True when two directory handles refer to the same folder. */
export async function isSameDirectory(
  a: FileSystemDirectoryHandle,
  b: FileSystemDirectoryHandle,
): Promise<boolean> {
  try {
    return await a.isSameEntry(b);
  } catch {
    return a.name === b.name;
  }
}

/**
 * Move or rename a file, including across directories.
 * Uses FileSystemFileHandle.move when available; otherwise copy + delete.
 */
export async function moveFile(
  sourceDir: FileSystemDirectoryHandle,
  destDir: FileSystemDirectoryHandle,
  oldName: string,
  newName: string,
): Promise<void> {
  if ((await isSameDirectory(sourceDir, destDir)) && oldName === newName) return;
  log.debug(
    `moveFile: "${sourceDir.name}/${oldName}" → "${destDir.name}/${newName}"…`,
  );
  const fileHandle = await sourceDir.getFileHandle(oldName);
  const movable = fileHandle as FileSystemFileHandle & {
    move?: (
      dest: string | FileSystemDirectoryHandle,
      name?: string,
    ) => Promise<void>;
  };
  if (typeof movable.move === "function") {
    try {
      if (await isSameDirectory(sourceDir, destDir)) {
        await movable.move(newName);
      } else {
        await movable.move(destDir, newName);
      }
      log.debug("moveFile: moved via FileSystemFileHandle.move");
      return;
    } catch (err) {
      log.warn("moveFile: FileSystemFileHandle.move failed, copying:", err);
    }
  }

  const file = await fileHandle.getFile();
  const data = await file.arrayBuffer();
  const newHandle = await destDir.getFileHandle(newName, { create: true });
  const writable = await newHandle.createWritable();
  await writable.write(data);
  await writable.close();
  if (!(await isSameDirectory(sourceDir, destDir)) || oldName !== newName) {
    await sourceDir.removeEntry(oldName);
  }
  log.debug("moveFile: copied then removed old file");
}

/** A directory under a walk root, with a slash-separated path ("" = the root). */
export interface FolderRef {
  relPath: string;
  handle: FileSystemDirectoryHandle;
}

/** Root plus every nested subdirectory, sorted by path. */
export async function listDirectoriesRecursive(
  root: FileSystemDirectoryHandle,
): Promise<FolderRef[]> {
  const result: FolderRef[] = [{ relPath: "", handle: root }];
  await collectDirectories(root, "", result);
  result.sort((a, b) =>
    a.relPath.localeCompare(b.relPath, undefined, { sensitivity: "base" }),
  );
  return result;
}

async function collectDirectories(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: FolderRef[],
): Promise<void> {
  const entries = await listDirectory(dir);
  for (const entry of entries) {
    if (entry.kind !== "directory") continue;
    try {
      const handle = await dir.getDirectoryHandle(entry.name);
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      out.push({ relPath, handle });
      await collectDirectories(handle, relPath, out);
    } catch (err) {
      log.warn(`listDirectoriesRecursive: skip "${entry.name}":`, err);
    }
  }
}
