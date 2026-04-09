# V1 Pre-Ship Cleanup: Tier 2 Changes

**Date:** 2026-04-08

## What was done

Five Tier 2 (simplify-before-freeze) items from the pre-V1 code review.

### 6. Extracted shared panel resize controller

Created `src/controllers/panel-resize-controller.ts` — a Lit `ReactiveController`
that encapsulates the mousedown/mousemove/mouseup resize logic, min/max width
clamping, body cursor override, and settings persistence. Replaced ~35 lines of
duplicated resize code in both `playlist-editor.ts` and `playlist-play.ts` with
a single `PanelResizeController` instance each.

### 7. Deduplicated lyrics HTML extraction helpers

Created `src/utils/lyrics-html.ts` with shared functions:
- `extractStyleBlock` — extract `<style>` contents from a full HTML document
- `extractBodyContent` — extract `<body>` contents
- `rewriteBodySelectors` — rewrite `body` CSS selectors to `.lyrics-content`
- `wrapLyricsHtml` — reassemble a full HTML document from parts

Removed duplicate implementations from `song-play.ts` and replaced inline
regex extraction in `song-onboard.ts` (`renderLeftPanel`, `buildNormalizedHtmlFromEditor`)
with calls to the shared functions.

### 8. Removed duplicate `escapeHtml` from song-onboard

Deleted the local `escapeHtml` function at the bottom of `song-onboard.ts` and
imported the identical function from `html-scraper.ts` instead.

### 9. Used StateEvents constants consistently

Changed `this.state.emit("songs-loaded")` in `caller-buddy.ts` line ~558 to
`this.state.emit(StateEvents.SONGS_LOADED)`, using the typed constant.

### 10. Added runtime validation for Settings JSON

Added `normalizeSettings(raw: unknown): Settings` to `src/models/settings.ts`.
It validates each field with type checks and range bounds, falling back to
defaults for invalid values. Updated `caller-buddy.ts` `loadSettings()` to use
`normalizeSettings(JSON.parse(text))` instead of the unsafe `as Settings` cast.

## Files touched

- `src/controllers/panel-resize-controller.ts` — new file
- `src/utils/lyrics-html.ts` — new file
- `src/components/playlist-editor.ts` — use PanelResizeController, remove resize code
- `src/components/playlist-play.ts` — use PanelResizeController, remove resize code
- `src/components/song-play.ts` — import shared lyrics helpers, remove local copies
- `src/components/song-onboard.ts` — import shared lyrics helpers + escapeHtml, remove locals
- `src/models/settings.ts` — add normalizeSettings
- `src/caller-buddy.ts` — use normalizeSettings, use StateEvents constant

## Verification

- Full build with `BASE_PATH=CallerBuddy` succeeds
- TypeScript typecheck passes
- All 146 unit tests pass
- No linter errors introduced
- Bundle size decreased slightly (~415 KB vs ~416 KB previously)
