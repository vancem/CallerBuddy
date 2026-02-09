/**
 * Minimal type declarations for File System Access API (showDirectoryPicker).
 * Used for CallerBuddyRoot folder selection. Chrome/Edge.
 */
interface FileSystemPickerOptions {
  mode?: "read" | "readwrite";
}

interface FileSystemHandle {
  readonly kind: "file" | "directory";
  readonly name: string;
  isSameEntry(other: FileSystemHandle): Promise<boolean>;
}

interface FileSystemFileHandle extends FileSystemHandle {
  readonly kind: "file";
  getFile(): Promise<File>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  readonly kind: "directory";
  getDirectoryHandle(name: string, options?: FileSystemPickerOptions): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string, options?: FileSystemPickerOptions): Promise<FileSystemFileHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>;
  values(): AsyncIterableIterator<FileSystemFileHandle | FileSystemDirectoryHandle>;
  keys(): AsyncIterableIterator<string>;
  entries(): AsyncIterableIterator<[string, FileSystemFileHandle | FileSystemDirectoryHandle]>;
}

interface Window {
  showDirectoryPicker(options?: FileSystemPickerOptions): Promise<FileSystemDirectoryHandle>;
}
