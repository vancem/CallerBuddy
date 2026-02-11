# SoundTouchJS Pitch/Tempo Library Integration

**Date:** 2026-02-11  
**Scope:** Research, selection, and integration of a pitch/tempo processing library

## What was done

Researched, evaluated, and integrated a pitch/tempo processing library to
replace the stubbed setPitch() and setTempo() methods in the AudioEngine.

### Research and evaluation

Evaluated five approaches for independent pitch shifting and tempo stretching
in the browser:

| Library | License | Size | Fit | Verdict |
|---------|---------|------|-----|---------|
| **SoundTouchJS** (soundtouchjs v0.3.0) | LGPL-2.1 | ~25 KB gzipped in bundle | Perfect — purpose-built, proven algorithm | **Selected** |
| **Tone.js** (v15.1.22) | MIT | 5.4 MB unpacked | Full DAW framework, massive overkill | Rejected |
| **soundtouch-ts** | LGPL-2.1 | Small | Stripped-down TS port, unmaintained (13 stars) | Rejected |
| **Raw Web Audio API** | — | 0 | playbackRate changes pitch+tempo together; detune broken on Safari/Firefox | Rejected |
| **Rubber Band (WASM)** | GPL-2.0 | N/A | No maintained JS/WASM port exists | Rejected |

SoundTouchJS was chosen because:
- It's a direct port of the proven SoundTouch C++ library (WSOLA algorithm)
- Zero dependencies, ~25 KB contribution to gzipped bundle
- Simple PitchShifter API that wraps Web Audio ScriptProcessorNode
- Has `pitchSemitones` property (perfect match for our half-step control)
- Has `tempo` property (ratio-based, we convert BPM delta to ratio)
- Has `percentagePlayed` setter for seeking
- Upgrade path exists to AudioWorklet variant if ScriptProcessorNode is dropped

For **future BPM detection** (FUTURE.md), the `web-audio-beat-detector` package
(MIT, TypeScript, ~42 KB, 2.4K weekly downloads) was identified as a good fit.
It can be added independently without replacing SoundTouchJS.

### Implementation

**New files:**
- `src/soundtouchjs.d.ts` — TypeScript type declarations for the soundtouchjs
  module. Covers PitchShifter, SoundTouch, WebAudioBufferSource, SimpleFilter,
  and supporting types.

**Modified files:**
- `src/services/audio-engine.ts` — Complete rewrite of WebAudioEngine:
  - Replaced raw AudioBufferSourceNode with SoundTouchJS PitchShifter for all
    playback. The PitchShifter processes audio through the WSOLA algorithm.
  - **setPitch(halfSteps)** now sets `shifter.pitchSemitones` for real pitch
    shifting. Positive values shift up, negative shift down.
  - **setTempo(deltaBPM)** converts BPM delta to a ratio using a reference BPM
    of 128 (typical square dance tempo): `ratio = 1 + delta/128`. Clamped to
    0.5x–2.0x range.
  - **Looping** implemented by monitoring the PitchShifter's `play` event
    (reports timePlayed) and seeking back to loopStart when loopEnd is reached.
    Also handles the onEnd callback for looping when the buffer is exhausted.
  - **Seeking** uses `percentagePlayed` setter on the PitchShifter.
  - **Play/pause** works by connecting/disconnecting the PitchShifter from the
    GainNode. The PitchShifter's internal position is preserved on disconnect.
  - **Volume, playBeep, dispose** are unchanged.
- `BACKLOG.md` — Updated Design Decisions with full SoundTouchJS rationale and
  alternatives analysis. Marked the pitch/tempo evaluation task as complete.
  Added triggers for reconsidering the decision.
- `package.json` / `package-lock.json` — Added `soundtouchjs` dependency.

### Build verification

- `npx tsc --noEmit` — passes cleanly (exit code 0)
- `npm run build` — passes cleanly, produces:
  - `dist/assets/index-B3ukBbuw.js` — 98.56 KB (25.35 KB gzipped)
  - SoundTouchJS code confirmed present in the production bundle
- Vite dev server starts without errors

## Key design decisions

1. **SoundTouchJS PitchShifter replaces AudioBufferSourceNode** — all playback
   now routes through the PitchShifter, even at default pitch/tempo. This avoids
   complexity of switching between two playback paths.

2. **BPM delta → ratio conversion** uses a reference BPM of 128. This is
   approximate since we don't yet know the song's original tempo. When the Song
   model's `originalTempo` is populated (future BPM detection), that value
   should be used instead for exact control.

3. **ScriptProcessorNode is acceptable for now** — while deprecated, it's still
   universally supported. The AudioWorklet variant exists as a migration path.

4. **LGPL-2.1 compliance** — soundtouchjs is used as an unmodified separate npm
   module, which satisfies LGPL 6b requirements. The source is available via
   the npm registry and GitHub.

## What's next (recommended priority order)

1. **Manual browser testing** — Load the dev server, pick test-data folder, play
   a song, verify pitch/tempo controls produce audible changes.
2. **OPFS caching layer** — Implement offline caching for audio files.
3. **Keyboard shortcuts** — Add keyboard handlers per the spec.
4. **ESLint + Vitest setup** — Get proper linting and unit tests in place.

## Compilation status

TypeScript compiles cleanly (`npx tsc --noEmit` exits with code 0).  
Vite build succeeds. Bundle: 98.56 KB / 25.35 KB gzipped.
