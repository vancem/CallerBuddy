# Subfolder Navigation Feature Implementation

Implemented Features 1 (click-to-navigate) and 2 (open folder in new tab) from
the subfolder navigation backlog item. Feature 3 (side-by-side split pane) is
deferred; the architecture supports adding it later as a pure layout change.

## Key Architectural Change

Songs moved from global state (`state.songs`) to per-editor state. Each
`<playlist-editor>` instance now owns its own song list, loaded from its own
`dirHandle`. This makes multiple independent editor tabs possible.

## Files Changed

### `src/models/song.ts`
- Added optional `dirHandle?: FileSystemDirectoryHandle` field to the `Song`
  interface (runtime-only, not persisted to songs.json).
- Added `songForPersistence()` helper to strip runtime-only fields before
  serialization.

### `src/services/song-library.ts`
- `saveSongsJson()` now strips `dirHandle` from songs before JSON serialization
  using the new `songForPersistence()` function.

### `src/components/playlist-editor.ts` (largest change)
- Editor is now a self-contained component with its own folder state.
- New properties: `dirHandle` (passed from tab data), `localSongs`, `subfolders`,
  `handleStack` (breadcrumb navigation), `loading`.
- Renders subfolder rows above song rows with folder icon and click-to-navigate.
- Breadcrumb bar for multi-level navigation (visible when navigated below root).
- Context menu on folders: "Open folder" (navigate in-place) and "Open in new
  tab" (creates new editor tab).
- No longer listens to `SONGS_LOADED` global event; manages its own song list.
- Triggers per-folder BPM detection after loading.

### `src/services/app-state.ts`
- Added `EditorTabData` interface for typed tab payload.
- `state.songs` and `setSongs()` deprecated (kept for backward compat).
- Added `findEditorTabByHandle()` using `isSameEntry()` for duplicate prevention.
- Added `openEditorTab()` that prevents duplicate tabs for the same folder.

### `src/components/app-shell.ts`
- `renderTab()` now receives the full tab object (not just type) so it can pass
  `dirHandle` from `EditorTabData` to `<playlist-editor>`.
- Multiple PlaylistEditor tabs are now supported.

### `src/caller-buddy.ts`
- `activateRoot()` simplified: opens editor tab via `openEditorTab()`, no longer
  calls `loadAndMergeSongs()` or `setSongs()` directly (editor does its own load).
- `loadSongAudio()` and `loadLyrics()` now use `song.dirHandle ?? state.rootHandle`
  to resolve files from the correct folder.
- `updateSong()` reads/updates the correct folder's songs.json using
  `song.dirHandle`.
- `detectBpmForAllSongs()` replaced with `detectBpmForSongs(dirHandle, songs,
  onUpdate)` — per-folder, called by each editor instance, with a callback for
  UI refresh.
- Added `openFolderTab()` public method for opening subfolder in new tab.

## Design Decisions Applied
- Each folder has its own `songs.json` (per BACKLOG decision).
- Songs carry their `dirHandle` at runtime for playlist playback.
- Duplicate tab prevention uses `FileSystemDirectoryHandle.isSameEntry()`.
- Tabs-only approach (no side-by-side split pane for V1).
