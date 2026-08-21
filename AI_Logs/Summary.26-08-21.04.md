# Summary 26-08-21.04

## What

Playlist editor: Enter in the song filter moves focus to the song table, and
+ / Play now (P) clear the text filter so a Ctrl+F → type → Enter → + loop
works.

## Why

Enter in the filter previously only stopped the key from starting playlist
playback, so the next + was ignored (still typing in the text box). Clearing
the filter after add/play-now lets the caller search for the next song without
manually hitting ×.

## Files

- `src/components/playlist-editor.ts` — Enter focuses the table; add/play-now
  (including context-menu add) clear `filterText`
- `src/help-content.md` — search-and-add loop and shortcut table
- `e2e/basic-flow.spec.ts` — Ctrl+F / Enter / = coverage
