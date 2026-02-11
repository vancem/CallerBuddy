# Automatic BPM Detection Integration

**Date:** 2026-02-11  
**Scope:** Install and integrate web-audio-beat-detector for automatic BPM
detection of songs

## What was done

Added automatic BPM (beats per minute) detection for all songs in the library.
When songs are loaded, any song without a known originalTempo is analyzed in the
background and the result is persisted to songs.json. The detected BPM is also
used to improve the accuracy of tempo adjustment calculations.

### Library choice

**web-audio-beat-detector** (v8.2.35, MIT license)
- Built-in TypeScript declarations
- Uses a Web Worker internally — analysis doesn't block the main thread
- Simple API: `guess(audioBuffer)` → `{ bpm, offset }`
- Actively maintained (published 7 days ago), 2.4K weekly downloads
- 42 KB unpacked, adds ~27 KB gzipped to the bundle

### New files

- `src/services/bpm-detector.ts` — BPM detection service wrapping
  web-audio-beat-detector. Creates a dedicated AudioContext for decoding
  (separate from the playback context). For songs >45 seconds, analyzes a
  30-second window starting at 25% into the track to get the steadiest beat.
  Uses a 90–170 BPM search range tuned for square dance music.

### Modified files

- `src/caller-buddy.ts`:
  - Imports `detectBPM` from the new service
  - Added `detectBpmForAllSongs()` — runs after songs are loaded, iterates
    through songs with `originalTempo === 0`, reads audio, detects BPM, and
    persists results. Processes sequentially, fire-and-forget.
  - `activateRoot()` now calls `detectBpmForAllSongs()` after the UI is ready
  - `loadSongAudio()` now passes `song.originalTempo` to `setTempo()` for
    accurate tempo ratio calculation

- `src/services/audio-engine.ts`:
  - `setTempo(deltaBPM, referenceBPM?)` — now accepts optional reference BPM.
    When provided and > 0, computes exact ratio as `(ref + delta) / ref`.
    Falls back to default 128 BPM when not provided.
  - Updated both the interface and implementation

- `src/components/song-play.ts`:
  - `adjustTempo()` now passes `song.originalTempo` to `setTempo()`
  - Added BPM display next to the tempo adjustment controls (shows "128 BPM"
    when detected, hidden when unknown)
  - Added `.adj-hint` CSS class for the subtle BPM label

- `src/components/playlist-editor.ts`:
  - Added "BPM" column to the song table showing detected tempo
  - Shows "—" for songs not yet analyzed
  - Tooltip indicates detection status
  - Added `.bpm-cell` CSS styling

- `FUTURE.md` — Marked BPM detection item as done
- `BACKLOG.md` — Added web-audio-beat-detector design decision with rationale,
  analysis window details, and reconsideration triggers
- `package.json` / `package-lock.json` — Added `web-audio-beat-detector` dep

## Build verification

- `npx tsc --noEmit` — passes cleanly (exit code 0)
- `npm run build` — passes cleanly:
  - 843 modules transformed (includes Web Worker code from the beat detector)
  - `dist/assets/index-BtVkLAru.js` — 191.31 KB (52.06 KB gzipped)
  - Up from 98.56 KB (25.35 KB gzipped) before BPM detector

## Key design decisions

1. **Background processing** — BPM detection runs after the UI is ready, one
   song at a time, so it never blocks the user experience. The Web Worker
   inside web-audio-beat-detector keeps the main thread responsive.

2. **Detect once, persist forever** — Results are saved to songs.json. Songs
   that already have originalTempo > 0 are skipped. This means the expensive
   analysis only happens once per song.

3. **Improved tempo accuracy** — When originalTempo is known, `setTempo` uses
   it as the reference instead of the hardcoded 128 BPM default. This makes
   tempo adjustments like "+5 BPM" mathematically exact.

4. **Analysis window** — For songs >45 seconds, we analyze 30 seconds from the
   25% mark. This avoids intros/outros that may not have a steady beat.

## Compilation status

TypeScript compiles cleanly (`npx tsc --noEmit` exits with code 0).  
Vite build succeeds. Bundle: 191.31 KB / 52.06 KB gzipped.
