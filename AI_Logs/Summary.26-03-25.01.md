# Lyrics Editor Feature

**Date:** 2026-03-25

## Summary

Implemented an in-place lyrics editor in the song-play view, allowing users to
edit existing HTML lyrics or create new lyrics files for songs that have none.
Uses native `contenteditable` with `document.execCommand` for formatting — no
new dependencies added.

## Files Modified

- **`src/models/song.ts`** — Added `lyricsFilenameFor()` utility that derives a
  `.html` lyrics filename from a music filename (same basename).

- **`src/caller-buddy.ts`** — Added `saveLyrics(song, lyricsFilename,
  htmlContent)` method to the CallerBuddy class. Writes the lyrics HTML file to
  disk and, if the song previously had no lyrics file, updates `song.lyricsFile`
  and persists the change to `songs.json`.

- **`src/components/song-play.ts`** — Major changes:
  - Added module-level helpers: `DEFAULT_LYRICS_STYLE`, `extractStyleBlock()`,
    `extractBodyContent()`, `wrapLyricsHtml()`, `generateLyricsTemplate()`.
  - Added `@state() editing` toggle and `updated()` lifecycle hook to populate
    the contenteditable editor when entering edit mode.
  - Global keyboard handler skips transport shortcuts while editing.
  - `render()` updated: left panel shows editor when `this.editing` is true
    (even for patter songs creating lyrics for the first time).
  - `renderLyrics()` delegates to `renderLyricsEditor()` in edit mode.
  - `renderLyricsEditor()`: toolbar (Bold, H2, Info, P, Save, Cancel) plus a
    `contenteditable` div. Toolbar buttons use `mousedown preventDefault` to
    avoid stealing focus from the editor.
  - `renderEditLyricsButton()`: shows "Edit Lyrics" for singing calls, "Create
    Lyrics" for patter.
  - Formatting actions: `execBold`, `execSection`, `execParagraph` via
    `document.execCommand`; `execInfo` wraps selection in `<span class="info">`
    via Selection/Range API.
  - Save flow: extracts `innerHTML` from editor, re-wraps into full HTML
    document preserving original `<style>`, writes via `callerBuddy.saveLyrics`.
  - Cancel flow: discards edits; for new lyrics reverts `this.lyrics` to empty.
  - CSS: editor container, toolbar, contenteditable styling added.

## Design Decisions

- **No new dependencies:** `contenteditable` + `execCommand` is the simplest
  approach. `execCommand` is deprecated but universally supported in
  Chrome/Edge (the only target browsers).
- **Shadow DOM compatibility:** `execCommand` works in shadow DOM.
  `shadowRoot.getSelection()` used for the Info span wrapping (non-standard but
  supported in Chromium).
- **Lit re-render safety:** The contenteditable div is rendered empty in the Lit
  template. Content is injected once via `updated()` when entering edit mode.
  Subsequent re-renders don't touch the editor's children.
- **HTML round-trip:** On save, the edited body content is re-wrapped with the
  original `<style>` block into a full HTML document, preserving the file format
  of existing lyrics files.
