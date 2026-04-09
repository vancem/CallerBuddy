# V1 Pre-Ship Cleanup: Tier 1 Changes

**Date:** 2026-04-08

## What was done

Five Tier 1 (highest priority) items from a comprehensive pre-V1 code review.

### 1. Verified manifest/icon paths under subpath hosting (no change needed)

Built with `BASE_PATH=CallerBuddy` and confirmed that Vite correctly rewrites
`/manifest.json` and `/callerBuddy.svg` to `/CallerBuddy/manifest.json` and
`/CallerBuddy/callerBuddy.svg` in `dist/index.html`. No code change required.

### 2. Removed dead CSS from song-play.ts (~70 lines)

Deleted `.editor-container`, `.editor-toolbar`, `.toolbar-btn` (and variants),
`.toolbar-spacer`, and `.lyrics-editor` CSS rules from `song-play.ts`. These
targeted nodes that only exist inside `<lyrics-editor>`'s shadow DOM and had
zero effect due to Lit's shadow encapsulation. The live styles for these
elements are in `lyrics-editor.ts`.

### 3. Removed deprecated `songs`/`setSongs` from AppState

- Deleted `songs: Song[]` field (was deprecated, marked as per-editor-only).
- Deleted `setSongs()` method (had zero call sites).
- Removed the mirror-write in `caller-buddy.ts` `updateSong()` that maintained
  the global `state.songs` array. The `SONG_UPDATED` event + per-editor
  `localSongs` arrays already handle song updates correctly.

### 4. Added active tab guard to playlist-editor keydown handler

Added `if (this.tabId && callerBuddy.state.activeTabId !== this.tabId) return;`
at the top of the `onKeydown` handler in `playlist-editor.ts`, matching the
pattern used in `playlist-play.ts`. Defensive: currently the editor is only in
the DOM when active, but this guards against future keep-alive changes.

### 5. Clear audio callbacks in song-play disconnectedCallback

Added `callerBuddy.audio.onTimeUpdate(() => {})` and
`callerBuddy.audio.onEnded(() => {})` to `disconnectedCallback` in
`song-play.ts`. Previously, stale callbacks from a destroyed component could
fire after the element was removed from the DOM.

## Files touched

- `src/components/song-play.ts` — dead CSS removal, audio callback cleanup
- `src/services/app-state.ts` — deprecated songs/setSongs removal
- `src/caller-buddy.ts` — removed mirror-write in updateSong
- `src/components/playlist-editor.ts` — active tab guard on keydown

## Verification

- Full build with `BASE_PATH=CallerBuddy` succeeds
- TypeScript typecheck passes
- All 146 unit tests pass
- No linter errors introduced
