/**
 * Type declarations for File System Access API (Chrome/Edge).
 * Used for CallerBuddyRoot folder selection and file I/O.
 *
 * Reference: https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API
 */

interface FileSystemPickerOptions {
  mode?: "read" | "readwrite";
}

interface FileSystemHandle {
  readonly kind: "file" | "directory";
  readonly name: string;
  isSameEntry(other: FileSystemHandle): Promise<boolean>;
  queryPermission(
    descriptor?: FileSystemPickerOptions,
  ): Promise<PermissionState>;
  requestPermission(
    descriptor?: FileSystemPickerOptions,
  ): Promise<PermissionState>;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
}

interface FileSystemFileHandle extends FileSystemHandle {
  readonly kind: "file";
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemDirectoryHandle extends FileSystemHandle {
  readonly kind: "directory";
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemDirectoryHandle>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileSystemFileHandle>;
  removeEntry(
    name: string,
    options?: { recursive?: boolean },
  ): Promise<void>;
  resolve(
    possibleDescendant: FileSystemHandle,
  ): Promise<string[] | null>;
  values(): AsyncIterableIterator<
    FileSystemFileHandle | FileSystemDirectoryHandle
  >;
  keys(): AsyncIterableIterator<string>;
  entries(): AsyncIterableIterator<
    [string, FileSystemFileHandle | FileSystemDirectoryHandle]
  >;
}

interface Window {
  showDirectoryPicker(
    options?: FileSystemPickerOptions,
  ): Promise<FileSystemDirectoryHandle>;
}
