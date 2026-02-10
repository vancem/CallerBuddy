# Core Application Architecture – First Draft

**Date:** 2026-02-10  
**Scope:** Full application architecture, data flow, and all major UI components

## What was done

This session implemented the full CallerBuddy application architecture from the
ground up. The previous codebase was a hello-world PWA shell (welcome view with
a folder picker and a trivial popup showing folder contents). That has been
replaced with the real application structure.

### Architecture (new files created)

**Models:**
- `src/models/song.ts` — Song data model matching the spec (title, label,
  category, rank, loopStartTime, loopEndTime, volume, pitch, tempo, etc.).
  Includes filename parsing for the `LABEL - TITLE.ext` convention.
- `src/models/settings.ts` — App settings model (break/patter timer defaults).

**Services:**
- `src/services/logger.ts` — Lightweight logging wrapper with log levels and
  an `assert()` utility for runtime pre/post conditions.
- `src/services/file-system-service.ts` — Wraps File System Access API.
  Handles directory handle persistence in IndexedDB, permission management,
  file reading/writing, and directory listing.
- `src/services/song-library.ts` — Scans directories for MP3/WAV files, pairs
  them with matching lyrics (HTML/MD), reads/writes songs.json, and merges
  scanned results with persisted data.
- `src/services/audio-engine.ts` — Defines the `AudioEngine` interface and
  provides a `WebAudioEngine` implementation using Web Audio API. Basic playback
  (play, pause, stop, seek, volume, looping) is fully functional. Pitch and
  tempo modification are **stubbed** — the interface is ready for a real DSP
  backend (e.g. SoundTouchJS) to be plugged in.
- `src/services/app-state.ts` — EventTarget-based centralized state with tab
  management, playlist manipulation, and change events.

**Application core:**
- `src/caller-buddy.ts` — The CallerBuddy singleton. Owns all services and
  state. Orchestrates initialization, root folder setup, song loading, audio
  playback, and tab navigation. Exported as a module-level singleton.
- `src/main.ts` — Entry point that bootstraps the CallerBuddy singleton.

**UI Components (Lit):**
- `src/components/app-shell.ts` — Root shell with Chrome-like tab bar and a
  global hamburger menu (upper-right). Renders the active tab's component.
- `src/components/tab-bar.ts` — Tab bar with click-to-activate and close buttons.
- `src/components/welcome-view.ts` — Rewritten. Popup removed. Shows welcome
  text and a folder picker that triggers CallerBuddy initialization.
- `src/components/playlist-editor.ts` — Song browser (table with columns: title,
  label, category, rank, type) with text filtering, sorting, right-click context
  menu, and a playlist panel on the left.
- `src/components/playlist-play.ts` — Playlist playback view with played/unplayed
  tracking, cursor, break timer with countdown and alarm, and a clock.
- `src/components/song-play.ts` — Single-song playback with lyrics display (or
  loop controls for patter), transport controls, volume/pitch/tempo adjustments,
  a 7-segment progress slider, time displays, and a clock.

### Other changes
- Deleted `src/my-element.ts` (old Vite/Lit demo component).
- Deleted old `src/welcome-view.ts` (pre-architecture version).
- Updated `index.html` to use new entry point (`src/main.ts`, `<app-shell>`).
- Updated `src/index.css` with CSS custom properties for the dark theme.
- Enhanced `src/file-system-access.d.ts` with queryPermission, requestPermission,
  createWritable, and other needed API declarations.

### Test data
- Created `scripts/generate-test-data.cjs` which generates 3 WAV audio files
  and 2 matching HTML lyrics files in `test-data/`:
  - `SQD 101 - Sunny Side Singing.wav` + `.html` (singing call)
  - `RYL 202 - Mountain Morning.wav` + `.html` (singing call)
  - `PTR 301 - Steady Groove Patter.wav` (patter, no lyrics)
- Added `test-data/` to `.gitignore`.

### BACKLOG updates
- Added 7 new open design issues (pitch/tempo library, OPFS caching, drag-and-
  drop, keyboard shortcuts, subfolder navigation, help tab, PWA icons).
- Added 8 new feature items (ESLint TS config, Vitest tests, Playwright tests,
  settings persistence, column filters, auto-close flow, playlist stats).
- Added 5 new questions/clarifications (WAV support, unsafeHTML safety, audio
  context suspension, reconnect flow).
- Added 3 new design decisions (CallerBuddy singleton pattern, AudioEngine
  interface, IndexedDB for handle persistence).

## Key design decisions made during implementation

1. **CallerBuddy singleton via module export** — cleanest way to share state
   across components without a DI framework.
2. **TypeScript enums replaced with `const` objects** — the project's tsconfig
   uses `erasableSyntaxOnly: true` which prohibits `enum` syntax. Used
   `as const` pattern instead.
3. **AudioEngine as an interface** — the processing backend can be swapped
   without touching the UI or data flow. This is the recommended next step.
4. **WAV support added alongside MP3** — needed for test data (generating MP3
   requires an encoder library). Costs nothing to support.

## What's next (recommended priority order)

1. **Manual testing** — Load the dev server, pick the test-data folder, verify
   the full flow works end-to-end (welcome → editor → playlist → play).
2. **Integrate a pitch/tempo library** — Evaluate SoundTouchJS, plug it into
   the AudioEngine interface.
3. **OPFS caching** — Implement offline caching for audio files and metadata.
4. **Keyboard shortcuts** — Add keyboard handlers per the spec.
5. **ESLint + Vitest setup** — Get proper linting and unit tests in place.
6. **Drag-and-drop** in the playlist editor.
7. **Subfolder navigation** in the playlist editor.

## Compilation status

TypeScript compiles cleanly (`npx tsc --noEmit` exits with code 0).  
Vite dev server starts successfully.
