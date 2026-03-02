# Playlist Player Drag-and-Drop Reorder

**Date:** 2026-03-02

## What was done

Added drag-and-drop reordering to the Playlist player. Previously only the
Playlist editor supported reordering; the player view now has the same capability.

## Approach

Extracted the reorder logic into a Lit `PlaylistReorderController` — a semantically
meaningful shared abstraction ("playlist reorder via drag"). Both the editor and
player use this controller. The editor keeps its additional behavior (drag from
song table into playlist) via optional config callbacks.

## Files Changed

### `src/controllers/playlist-reorder-controller.ts` (new)

- Lit `ReactiveController` that provides drag-and-drop reorder behavior.
- **State:** `dragOverIndex`, `dropPosition`, `draggingPlaylistIndex` (for
  template binding).
- **Handlers:** `onPlaylistItemDragStart`, `onPlaylistDragOver`,
  `onPlaylistContainerDragOver`, `onPlaylistDrop`, `onDragEnd`,
  `onPlaylistDragLeave`, `onDragEnter`.
- **Config (optional):** `onExternalDrop`, `getExternalDragData` (editor plugs in
  song-table drag), `onReorderComplete` (e.g. reset selection after reorder).
- On reorder drop: calls `callerBuddy.state.moveInPlaylist(from, to)`.

### `src/components/playlist-play.ts`

- Added `PlaylistReorderController` with `onReorderComplete` to reset
  `selectedIndex` after reorder (avoids stale selection).
- Bound drag handlers to playlist `<ol>` and each `<li>`.
- Added CSS: `drop-indicator-above`, `drop-indicator-below`, `dragging`, cursor
  for draggable items.
- Added `pointer-events: auto` on playlist panel when view is inactive so
  reordering works during playback.

### `src/components/playlist-editor.ts`

- Replaced ~50 lines of duplicated DnD state and handlers with
  `PlaylistReorderController`.
- Kept: `draggedSong`, `onSongDragStart`, `onEmptyPlaylistDrop` (editor-only).
- Added `onEditorDragEnd` wrapper that clears `draggedSong` and calls
  controller's `onDragEnd`.
- Passed `getExternalDragData` and `onExternalDrop` so controller handles drops
  from song table.

## Edge Cases Handled

- **Empty playlist in play view:** No drag handlers (shows "Playlist is empty.").
- **Reorder during playback:** Playlist panel stays interactive via
  `pointer-events: auto` override.
- **selectedIndex after reorder:** Reset to `null` so selection reverts to
  "first unplayed".
