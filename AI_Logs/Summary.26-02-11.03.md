# GUI Code Audit & Cleanup

**Date:** 2026-02-11
**Scope:** Audit all GUI components for hacks, unconventional patterns, and
lifetime issues; refactor to idiomatic, boring Lit code.

## Context

Two prior sessions identified event handling hacks (composedPath workarounds)
and lifetime concerns in the GUI layer. This session performed a full audit of
all 6 GUI components, AppState, and the CallerBuddy singleton, then cleaned up
every pattern that a Lit developer would question.

## What was done

### 1. Replaced `_tick++` hack with `requestUpdate()` (3 files)

**Files:** `app-shell.ts`, `playlist-editor.ts`, `playlist-play.ts`

All three components had a `@state() private _tick = 0` counter that was
incremented to force Lit to re-render when external state changed. This is an
anti-pattern — the standard Lit API for this is `this.requestUpdate()`.

- Removed the `_tick` state property from each component
- Changed event handler callbacks to call `this.requestUpdate()` instead

### 2. Replaced `setTimeout(fn, 0)` with `firstUpdated()` (1 file)

**File:** `song-play.ts`

The `connectedCallback` used `setTimeout(() => this.focusControlsPanel(), 0)`
to defer focus until after the first paint. Lit provides `firstUpdated()` as the
standard lifecycle hook for exactly this purpose.

- Removed the `setTimeout` call from `connectedCallback`
- Added a `firstUpdated()` override that calls `focusControlsPanel()`

### 3. Fixed direct playlist array mutation (2 files)

**Files:** `playlist-editor.ts`, `app-state.ts`

The "Add to start of playlist" context menu action directly mutated
`callerBuddy.state.playlist` with `.unshift()` and manually fired the event,
bypassing the AppState API that every other playlist operation uses.

- Added `insertAtStartOfPlaylist(song)` method to `AppState`
- Updated `playlist-editor.ts` to call the new method instead of raw mutation

### 4. Replaced parent-sniffing with `active` property (2 files)

**Files:** `playlist-play.ts`, `app-shell.ts`

The `playlist-play` component is kept alive across tab switches (for its break
timer). Its keydown handler checked `(this.parentElement as HTMLElement)?.hidden`
to know if it should respond — reaching outside its own boundary. The
conventional Lit approach is to receive this information as a property.

- Added `@property({ type: Boolean }) active = false` to `PlaylistPlay`
- `app-shell` now sets `.active=${activeTab?.type === TabType.PlaylistPlay}`
- Keydown handler now checks `if (!this.active) return`

### 5. Removed dead code in `renderTab()` (1 file)

**File:** `app-shell.ts`

The `renderTab()` switch had a `case TabType.PlaylistPlay` that could never
execute (PlaylistPlay is always rendered by the keep-alive block). Removed the
dead case and added a clarifying JSDoc comment.

### 6. Normalized keydown listener phase (1 file)

**File:** `song-play.ts`

The document-level keydown listener used capture phase (`true`), while the other
two components used the default bubbling phase. Capture phase means the handler
fires before inner `stopPropagation()` calls take effect, which is confusing.

- Changed `addEventListener("keydown", handler, true)` to bubbling (no `true`)
- Changed the matching `removeEventListener` call

### 7. Extracted shared format utilities (3 files)

**Files:** new `src/utils/format.ts`, `playlist-play.ts`, `song-play.ts`

Both `playlist-play` and `song-play` had identical `formatCountdown()` methods,
near-identical `updateClock()` logic, and `song-play` also had `formatTime()`.

- Created `src/utils/format.ts` with `formatTime()`, `formatCountdown()`, and
  `formatClock()`
- Both components now import from the shared module
- Removed the duplicated private methods

## Files changed

| File | Change |
|------|--------|
| `src/components/app-shell.ts` | Removed `_tick`, use `requestUpdate()`, pass `active` prop, remove dead case |
| `src/components/playlist-editor.ts` | Removed `_tick`, use `requestUpdate()`, use `insertAtStartOfPlaylist()` |
| `src/components/playlist-play.ts` | Removed `_tick`, use `requestUpdate()`, add `active` prop, use shared format utils |
| `src/components/song-play.ts` | `firstUpdated()`, bubbling keydown, use shared format utils |
| `src/services/app-state.ts` | Added `insertAtStartOfPlaylist()` method |
| `src/utils/format.ts` | **New file** — shared time formatting utilities |

## Compilation status

- `npx tsc --noEmit` — passes cleanly (exit code 0)
- No linter errors
- All changes are mechanical refactors with no behavior changes
