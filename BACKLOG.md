# CallerBuddy Backlog (Things that need to be done or have been decided)

Please also see CallerBuddySpec.md for the specification of user behavior.

## Rules

- Whenever there is a design question, the it should be added as an task list
item in BACKLOG.md. Small questions / issues can be placed in code files as
TODO items, however, they should also have an explicit task list item in the
BACKLOG.md file if they are important (need to be fixed before the next
release) HIGH: MEDIUM: and LOW: markers can be placed on the item to indicate
its priority. It is OK to guess answers to questions if the amount of rework
needed if the guess was not correct small. Otherwise the question should be
logged in BACKLOG.md
- Answers to the question can be placed as sub-bullets of question, or they
could be moved to the design decisions section, or the CallerBuddySpec.md file
if they an important user-facing decision.
- Note that the CallerBuddySpec.md and design decisions in BACKLOG.md tend to be
stable, but if we find during implementation that the specification or design
decision has become questionable (it is causing ongoing grief) we should
create a HIGH: priority task list item in BACKLOG.md to revisit this
spec/design issue.
- **AI summary logging (IMPORTANT):** For all but small, trivial changes, when
the Cursor Chatbot modifies source files it MUST create a summary markdown
file in AI_Logs/ named with the convention `Summary.YY-MM-DD.NN.md` where NN
starts at 01 and is zero-padded, incrementing for each new log that day. When
in doubt about whether a change is "trivial enough" to skip, create the
summary — it is cheap and valuable. The summary should describe what was done,
which files were touched, and why. This allows both humans and the chatbot to
look back over the history of changes and any notes.

## Design Philosophy

- The overarching design philosophy is: simplicity, readability, testability and
maintainability are top priorities. Minimalism is good, every framework has to
justify its inclusion in the app, simple obvious code is best.
- High standards that people who make the
[Modern Software Engineering](https://www.youtube.com/@ModernSoftwareEngineeringYT)
would be in evidence.
- Ideally we spend very little time debugging.
- This app does not benefit from concurrency and concurrency has the potential
to create subtle bugs. To avoid these, code (e.g. awaits) should try to stay
sequential unless there is a good reason to deviate from that default.

## Design Decisions

As important design decision are made, they are logged here, optionally with a
rationale.

**Mobile viewport & fullscreen (Android WebAPK).** Keep this aligned with the
long comment at the top of `src/main.ts` and the header comment on
`app-shell.ts` (startup fullscreen dialog).

- **Readable text without Fullscreen API:** On some Samsung/Android WebAPK
installs, portrait layout used a stale landscape width (`innerWidth` ~~980)
while `screen` reported the real device (~~360×780), shrinking the whole UI.
We drive `<meta name="viewport">` from `screen.orientation` and explicit
`width=<CSS px>` from the physical short/long edge. On some Chrome WebAPKs the
meta **updates in the DOM** but `**innerWidth` stays wrong** (~~980); a reflow
sandwich did not help in testing. In that case `applyViewportFix()` applies
`**zoom` on `<html>`** using `**1 / visualViewport.scale**` when shrink-to-fit
is reported (primary), else `innerWidth / expectedEdge` from `screen` +
orientation (capped; **damp × under-bias ~0.98** vs raw zoom → ~**2%** horizontal
undershoot vs full `1/scale`; vertical vs OS chrome may differ ~10% / ~15% — see `main.ts` banner).
Class `**cb-layout-zoom`** resets root font to 100% while zoom is active.
`**VIEWPORT_ZOOM_HARD_CAP_PORTRAIT**` (~~2.75; must cover `raw×0.98` when scale~~0.37, see `[viewport-math]`) /
`**VIEWPORT_ZOOM_HARD_CAP_LANDSCAPE**` (~~1.42; same for stuck `innerW` vs long edge) keep zoom orientation-aware; shell
`max-width` prevents wide-row clipping (Blink).
`**--cb-max-layout-px**` on `:root` plus `**app-shell` `max-width**` keep the
shell within the physical edge when `100vw` is wrong. On phones where
`innerWidth` already matches the screen edge, **no zoom runs**—only meta updates.
**Landscape often looks acceptable while portrait looks tiny** because the same
wrong layout width is scaled to fit a wide window (mild scale) vs a narrow one
(severe)—not because landscape is “correct”. Root font bump uses
`(pointer: coarse)` in `index.css` (Samsung often lies on `(hover: none)`). See
`applyViewportFix()` and the banner comment in `main.ts`.
- **Touch detection:** `(hover: none) and (pointer: coarse)` can fail on Samsung
One UI PWAs because `(hover: none)` is false. Use `(pointer: coarse)` and/or
`navigator.maxTouchPoints > 0` for touch gating.
- **Manifest fullscreen ≠ Fullscreen API:** Manifest `"display": "fullscreen"`
hides OS chrome but does **not** set `document.fullscreenElement`. Optional
“real” fullscreen uses `requestFullscreen()` only from an explicit control
(startup dialog primary button or menu), never from a global capture listener.
- **User gestures:** `requestFullscreen()` and File System `requestPermission()`
both require transient activation; stealing the first tap for fullscreen broke
folder reconnect. The startup dialog isolates fullscreen to its own button.
- **Fullscreen may exit:** Permission sheets often exit API fullscreen; we do
not auto-re-enter. Viewport fix keeps UI usable; menu toggles fullscreen.
- **Diagnostics:** `src/services/env-log.ts` logs `[env …]` snapshots on resize,
orientation, fullscreen, visibility — useful when APIs disagree with reality.
`**[viewport-math]`** (debounced, from `main.ts`) is the single line to read for
sizing: physical `screen` / `outer`, bogus `inner`, `vv.scale`, ideal `1/scale`,
`preCapZ` vs **applied** html zoom, `**hitCap`**, and heuristic `**gapFrom1**`
(positive ⇒ still too small vs natural 1.0).
- **Samsung A25 / non–Fullscreen-API layout follow-ups:** playlist editor, song
player, resize drags, and flex clipping are documented under
`**## Non-fullscreen layout issues on Samsung A25`** (end of Design Decisions).
- CallerBuddy will be a PWA application.
  - This is because PWA apps give us the cross platform reach that we need we
  avoid the need to generate many binaries for the different platforms.
- We prefer TypeScript to JavaScript whenever possible.
- We will use the Lit framework for UI components.
  - Rationale: The UI complexity (tabs, tables, sliders, drag-and-drop, audio
  controls) justifies a framework. Lit is lightweight (~5KB gzipped), provides
  component encapsulation, reactive properties, template rendering, and
  lifecycle hooks. Building equivalent functionality in vanilla TypeScript
  would require significant custom code. Lit aligns with the design philosophy
  of minimalism while providing necessary structure.
- We will be using Prettier for formatting. Code should confirm its defaults.
- We will be using Vite for building.
- We will be using Vitest for Unit testing.
- We will be using Playwright for UI testing.
- We will use Web Audio API for audio playback, with SoundTouchJS (soundtouchjs
v0.3.0, LGPL-2.1) for independent pitch shifting and tempo stretching.
  - Rationale: Web Audio API alone cannot independently change pitch and tempo
  (playbackRate changes both together; detune is broken on Safari/Firefox).
  SoundTouchJS is a JS port of the proven SoundTouch C++ library that uses
  WSOLA (Waveform Similarity Overlap-Add) for high-quality time stretching. It
  is lightweight (~25 KB gzipped in the bundle), zero-dependency,
  purpose-built for exactly this use case, and integrates cleanly with the Web
  Audio graph via its PitchShifter wrapper.
  - Alternatives evaluated and rejected:
    - **Tone.js** (MIT, 232K weekly downloads): Full DAW framework with synths,
    effects, scheduling. Has pitch shifting but is massive overkill for our
    needs (5.4 MB unpacked, 886 files). Would add unnecessary complexity and
    bundle bloat.
    - **soundtouch-ts** (LGPL-2.1, 13 stars): TypeScript port of the core
    SoundTouch algorithm but stripped-down, fewer utilities, no PitchShifter
    wrapper, much less maintained. Not ready for production use.
    - **Raw Web Audio API**: playbackRate changes pitch AND tempo together.
    detune property is broken on Safari (not supported) and limited on Firefox
    (max 1 octave range). Independent control requires implementing WSOLA or
    phase-vocoder from scratch — enormous effort, error-prone.
    - **Rubber Band (WASM)**: High-quality C++ library but no maintained JS/WASM
    port exists. Would require building from source with Emscripten, complex
    integration. Overkill for our needs.
  - Triggers to reconsider this decision:
    - If ScriptProcessorNode (deprecated) is removed from browsers, migrate to
    the AudioWorklet variant (@soundtouchjs/audio-worklet, same maintainer).
    - If audio quality on extreme pitch shifts (>4 half-steps) is poor, consider
    a phase-vocoder approach (Rubber Band WASM or similar).
    - If the LGPL-2.1 license becomes a concern for distribution, soundtouchjs
    is used as an unmodified separate module (compliant with LGPL 6b), but an
    MIT-licensed alternative could be sought.
  - For future BPM detection (FUTURE.md), the web-audio-beat-detector package
  (MIT, TypeScript, ~42 KB) is a good fit. It can be added independently
  without replacing SoundTouchJS since they serve different purposes.
- We will use web-audio-beat-detector (v8.2.35, MIT) for automatic BPM detection
of songs.
  - Rationale: The library uses a Web Worker internally so analysis doesn't
  block the main thread. It accepts an AudioBuffer and returns the estimated
  BPM. Works well for electronic/rhythmic music like square dance tracks.
  Detection runs in the background after songs are loaded, processing one song
  at a time (sequential, per design philosophy). Results are persisted to
  songs.json so each song is only analyzed once. The detected BPM is used as
  the reference for tempo adjustment calculations (replacing the default 128
  BPM assumption) and displayed in both the playlist editor and song-play UI.
  - Analysis window: for songs >45 seconds, we analyze 30 seconds starting at
  25% into the track (avoids intros/outros). Tempo search range is 90–170 BPM
  to match square dance music characteristics.
  - Triggers to reconsider: if detection accuracy is poor for certain music
  styles, the tempo range or analysis window can be tuned. If the ~27 KB
  gzipped addition to the bundle is a concern, detection could be made opt-in
  rather than automatic.
- We will use the File System Access API for accessing CallerBuddyRoot folder.
  - Rationale: This is the standard PWA approach for folder access. The API
  provides persistent permission handles that can be stored and reused across
  app sessions, which matches our requirements perfectly.
- We will use OPFS (Origin Private File System) for local caching of audio files
and metadata — **deferred to a post–V1 release** (see Open Design Issues).
  - Original rationale: OPFS is the modern PWA standard for large file storage
  and fits aggressive offline caching. We are not dropping the idea; we are
  deferring implementation until after V1 ships.
  - Why defer: OPFS is a large, cross-browser surface (handles, sync, eviction,
  quota). On Android, the folder picker is already local-device-only; on
  Windows/macOS, cloud-backed folders are often hydrated by the OS/client, so
  the pain point is uneven. Shipping V1 without a custom OPFS layer avoids
  that complexity while Folder Access + service worker shell still give a
  usable offline story for the app shell.
- **ZIP-based song import (unpack, heuristics, confirm in UI) is in scope for
V1**, implemented as the song-onboard flow (`song-onboard` + `song-onboarding`
heuristics). Batch import of many ZIPs and richer renaming flows may extend
later; FUTURE.md still tracks longer-term ideas.
- State management will start simple (EventTarget pattern or singleton) and only
add complexity if needed.
  - Rationale: Lit provides component-level reactivity. For global state
  (playlist, settings, current song), we'll start with a simple
  EventTarget-based event bus or singleton pattern. Only add a state
  management library if the simple approach becomes unwieldy.
- We will not be doing test driven development, but we will be front loading
testing. features need good testing early and that should be part of
developing the feature. If a bug was found AFTER testing (by users), part of
the fix needs to be a test that exercises the behavior (and any related test
hole).
- We will use a simple custom logging wrapper around console methods.
  - Rationale: A lightweight custom logger provides log levels (debug, info,
  warn, error) that can be filtered at runtime and during tests. No external
  logging package needed - just a thin wrapper that respects log levels and
  can be configured per environment. This keeps bundle size minimal and gives
  us the control we need for test diagnostics.
- The CallerBuddy singleton (src/caller-buddy.ts) is the central coordination
point. It owns the AppState (EventTarget-based), the AudioEngine, and
orchestrates all services. UI components import it and call methods on it.
  - Rationale: A single coordination object avoids scattered global state and
  makes the app's structure explicit. Components subscribe to state events and
  re-render reactively. This is the simplest approach that satisfies the
  spec's requirement for a "CallerBuddy object that represents the program as
  a whole."
- The AudioEngine interface (src/services/audio-engine.ts) abstracts audio
playback from the processing backend. The WebAudioEngine implementation uses
SoundTouchJS PitchShifter for all playback, enabling independent pitch and
tempo control. The PitchShifter replaces the raw AudioBufferSourceNode that
was used previously.
  - Rationale: The PitchShifter wraps a ScriptProcessorNode that reads from the
  decoded AudioBuffer through the SoundTouch WSOLA algorithm. This gives us
  independent pitch (in half-steps via pitchSemitones) and tempo (as a ratio
  via the tempo property) control. Looping is implemented by monitoring
  playback position and seeking back to the loop start. The interface
  abstraction is preserved so the backend can still be swapped if needed.
- IndexedDB is used to persist the CallerBuddyRoot directory handle across
browser sessions.
  - Rationale: The File System Access API supports storing handles in IndexedDB.
  This lets the app remember the user's chosen folder without re-prompting.
  - Android: Permission often reverts to "prompt" after reload. The welcome view
  offers "Reconnect to this folder" so the user can re-grant with one tap.
- PWA manifest and service worker configuration (manifest structure, caching
strategy, offline fallback, install prompt).
  - Manifest: display mode standalone; icons at 192px and 512px; theme colors
  aligned with app UI; start_url / scope at app root.
  - Service worker caching: static assets cache-first; app shell cached for
  offline; cache versioning via version in cache name so updates invalidate
  old caches.()
  - Offline: serve cached app shell when offline; show clear offline indicator;
  queue writes (e.g. to CallerBuddyRoot) for sync when back online.
  - Install prompt: trigger manually from UI (e.g. after folder setup), not
  automatic, so the user controls when they are prompted.
  - Rationale: Matches spec (offline-first, cloud folder, cached audio). Simple
  cache-first for shell gives reliable offline; manual install avoids
  intrusive prompts.

## Non-fullscreen layout issues on Samsung A25 

This section captures **Samsung Galaxy A25** (and similar One UI / Chrome **WebAPK** / installed PWA) behavior when **not** using the **Fullscreen API** (`document.fullscreenElement`), where **layout-related Web APIs disagree with the physical glass** and with each other. It is meant as a **handoff document** for future sessions that explore alternatives (Fullscreen-by-default, `transform` instead of `zoom`, different sizing strategies, vendor-specific hacks, etc.) without re-deriving measurements from scratch.

### What the device / stack looks like in logs

Typical log fingerprint (names vary slightly by build):

- **UA / platform:** `Mozilla/5.0 (X11; Linux x86_64) … Chrome/147…`, `platform="Linux armv81"`, `**uaMobile=false`** — treat as **desktop-class UA on a phone**, not a classic “mobile Safari” profile.
- **Installed PWA / WebAPK:** `touchInstalledPwa=true`, `**(display-mode: fullscreen)`** or **standalone** can be **true from the manifest** while `**document.fullscreenElement` is still null** — that is **not** the Fullscreen API (see existing “Manifest fullscreen ≠ Fullscreen API” decision in this file).
- `**fs=false`** in env lines means **Fullscreen API is off** — the issues below are worst in that mode.

### Which APIs return “wrong” or misleading values (and how)

These are **observed** on the A25 WebAPK in **portrait**, **non–Fullscreen-API** sessions; they are the root reason **CSS viewport media queries** and `**window.innerWidth`-based logic** break.


| Signal                                                    | Typical bad value / behavior                                                                                                               | What we trust instead                                                                                                                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**window.innerWidth` / `innerHeight`**                   | Stays ~**980×2053** in portrait — a **stale / landscape-ish layout width**                                                                 | `**screen.width` / `height`** + `**screen.orientation.type**`, `**window.outerWidth`/`outerHeight**`, `**visualViewport.scale**`, `**visualViewport` width/height** (dimensions often still layout-sized, but **scale** is useful) |
| `**<meta name="viewport">`**                              | `**content` updates** in the DOM (e.g. `width=360`)                                                                                        | Does **not** reliably change `**innerWidth`**; reflow “sandwich” did **not** fix in testing                                                                                                                                        |
| `**100vw` / viewport-relative MQs**                       | Follow the **bogus wide** layout viewport                                                                                                  | `**--cb-max-layout-px`** on `:root` from **screen + orientation**, plus `**app-shell`** `max-width: min(100vw, var(--cb-max-layout-px))`** to clamp the **shell** to the physical edge                                             |
| `**(max-width: 700px)` and similar**                      | Evaluate against **~980px** → **false** on a phone                                                                                         | **Container queries** on the **actual component host** (`song-play`, `playlist-editor`), or `**getBoundingClientRect()`** on the host, `**ResizeObserver**`                                                                        |
| `**visualViewport.scale**`                                | **~0.37** in portrait — whole page **shrink-to-fit** wrong layout                                                                          | Used as primary signal for `**zoom ≈ 1/scale`** in `applyViewportFix()` (see `main.ts` banner)                                                                                                                                     |
| **Pointer `clientX` / `clientY` deltas** vs **layout px** | With `**html { zoom }`** active (`**cb-layout-zoom**`), drag **deltas** can **overshoot** panel resize (slider moves more than the finger) | Scale deltas by `**1 / parseFloat(html.style.zoom)`** (`scalePointerDeltaForHtmlZoom` in `src/utils/html-zoom-pointer.ts`, used by `**PanelResizeController**`)                                                                    |


**Important nuance:** “Wrong” here means **inconsistent with the visible, interactive region we care about** for touch and reading — not necessarily that the engine is “buggy” in the abstract. The WebAPK appears to keep an **oversized layout viewport** and **visually scale** the page down, which is why `**visualViewport.scale`** is informative even when `**innerWidth**` is useless.

### Why the **simulator** and **Windows** do not show this (or show it mildly)

- **Desktop Chrome / responsive simulator:** Usually `**innerWidth`** matches the **emulated** layout width; `**<meta viewport>`** behaves; `**visualViewport.scale**` is ~**1**; `**100vw`** matches the tool width. No stuck **980px** portrait width.
- **No WebAPK layer:** The issue is tied to **installed PWA / Samsung + Chrome** behavior, not Lit or Vite.

### Why **Fullscreen API** mode often looks “fine” (or better)

- **Different chrome / layout path:** Entering **real** `requestFullscreen()` can **change** or **reset** layout so `**innerWidth`** and visible layout **align** with expectations — **not guaranteed**, but commonly **better**.
- **Manifest “fullscreen”** still leaves you in the broken `**innerWidth`≈980** world unless the **Fullscreen API** (or OS behavior) actually changes layout; do **not** conflate the two.

### Experiments and findings (chronological themes)

1. **Text / UI “tiny” (~2× too small)** — `**visualViewport.scale`** ~0.37 with `**innerWidth`≈980** vs `**screen`** short edge ~360; `**gapFrom1**` in `**[viewport-math]**` showed undershoot vs neutralize when **zoom caps** were too low (`hitCap=true`).
2. **Horizontal whitespace / wrong breakpoints** — `**max-width: 700px`** on `**welcome-view**` and viewport MQs on `**song-play**` saw **980px** “wide” viewport; **container queries** + `**clamp`** gutters fixed **welcome**; `**song-play`** uses **container width** + `**ResizeObserver`** + **host `getBoundingClientRect().width`** for `**isNarrowLayout()**`.
3. **Playlist editor** — `**@media (max-aspect-ratio: 6/5)`** used **980×2053** → wrong **row vs column** decision; **truncated list** / **flex** fighting a **phantom tall** viewport; fixed with `**container-type: size`**, `**@container cb-playlist-editor**`, `**ResizeObserver**`, `**min-height: 0**` on host/editor, and **title column** rules via **container** `(max-width: 700px) or (max-height: 520px)` instead of viewport-only MQs.
4. **Song player portrait** — **desktop grid** (lyrics left, controls fixed **320px**) squeezed into **~360px** shell → **sliver of lyrics**; same root cause as (2)–(3) for MQ vs real width; `**min-height: 0`** on `**.song-play` / panels** helps **grid `1fr`** receive scrollable height inside `**app-shell**`.
5. **Playlist resize slider “runs away” from finger** — pointer **deltas** in **layout** space vs `**html` zoom**; fixed by `**scalePointerDeltaForHtmlZoom`** in `**PanelResizeController**` (also **playlist-play** horizontal split).
6. **Vertical “can’t reach bottom” / clipping** — classic **flex** issue: `**app-shell` `.content`** needed `**min-height: 0**` so `**flex: 1; overflow: auto**` can scroll inside `**overflow: hidden**` shell.

### What we implemented (work-arounds) and where (complexity)

Rough layers — each is a **maintenance / portability** cost:

1. `**src/main.ts` — `applyViewportFix()`** — Touch-only; rewrites **viewport meta** from `**screen` + orientation**; optional `**html { zoom }`** from `**1/visualViewport.scale**` (fallback `**inner/expected**`), **damped / under-biased / capped** by orientation; sets `**--cb-max-layout-px`**; class `**cb-layout-zoom**`; debounced `**[viewport-math]**` logging.
2. `**src/index.css**` — `**html.cb-layout-zoom**` forces `**font-size: 100%**` so `**zoom` + 120% touch root** do not double-scale text.
3. `**src/components/app-shell.ts`** — `**max-width**` shell clamp; `**min-height: 0**` on `**.content**`; fullscreen / log / editor-gate UX (orthogonal but same device class).
4. `**src/components/welcome-view.ts**` — **Fluid gutters** + `**min(100%, max(36rem, min(72ch, 48rem)))`** instead of `**560px` @ 600px** viewport breakpoint.
5. `**src/components/song-play*.ts`** — **Container** narrow layout; `**ResizeObserver`**; `**isNarrowLayout()**` from **host width** + stuck-layout portrait heuristic; `**min-height: 0`** on grid / panels.
6. `**src/components/playlist-editor.ts**` — **Container** aspect + width/height for **stacked vs side-by-side** and **title** column; `**ResizeObserver`** on host.
7. `**src/utils/html-zoom-pointer.ts` + `src/controllers/panel-resize-controller.ts**` — Pointer **delta / zoom** correction when `**cb-layout-zoom`** is active.
8. `**src/services/env-log.ts` + `[viewport-math]**` — Forensics when APIs disagree.

**Total:** multiple **parallel strategies** (meta + zoom + shell clamp + per-component container logic + pointer scaling + flex min-heights). New contributors should read `**main.ts` banner**, this section, and `**[env …]` / `[viewport-math]`** lines from a device capture.

### Outlook: will we need more work-arounds?

**Likely yes, in some form**, until one of these **structural** changes happens:

- **Chrome / Samsung fixes** the WebAPK layout viewport so `**innerWidth`** and **meta viewport** agree (best outcome; outside our control).
- We **stop using `html { zoom }`** and adopt a **different** compensation (e.g. `**transform: scale()`** on a dedicated wrapper with explicit `**width`/`height**` derived from `**visualViewport**` — different bugs: hit-testing, `position: fixed`, focus rings, third-party).
- We **require Fullscreen API** (or a **post-permission** re-layout path) for “supported” mobile — **UX / gesture** cost and still **not** 100% stable when OS UI exits fullscreen.
- We **detect** this stack (`innerWidth` vs `**min(screen)`** + `**visualViewport.scale**`) and **branch** UI (e.g. force **container-only** layouts, disable gestures that assume 1:1 coords) — more code paths to test.

**Risk areas for future bugs:** any new **drag**, **resize**, `**100vh`**, `**position: fixed**`, `**100vw**`, or **viewport MQ** without **container** or `**visualViewport`** awareness can regress on the A25. `**html` zoom** specifically motivated `**scalePointerDeltaForHtmlZoom`** — any new pointer math should reuse it or re-derive from `**visualViewport**`.

**Suggested future work (tradeoffs to explore in a dedicated session):**

- **A.** Keep current stack; expand **container queries** + `**ResizeObserver`** everywhere; document “**never use viewport MQ for layout** on touch.”
- **B.** Replace `**zoom`** with `**transform: scale**` + explicit dimensions — **large refactor**, test **FS**, **permissions**, **scroll**.
- **C.** **Opt-in** “Samsung layout mode” user flag — isolates hacks at the cost of UX.
- **D.** **Fullscreen** after permission / on first editor open — already partially explored; **gesture** and **exit** handling remain constraints.

## Open Design Issues

- Decide whether to use the Lit framework (and put the justification in the
design decision section)
  - Decision: Use Lit. Rationale moved to Design Decisions section.
- Decide how to get the audio software that can modify tempo/pitch, and get
it integrated into the code base.
  - Decision: SoundTouchJS (soundtouchjs v0.3.0) integrated via PitchShifter.
  Full analysis in Design Decisions section.
- Decide on a logging strategy (do we use a logging package, which one?)
  - Decision: Custom lightweight logger wrapper. Rationale moved to Design
  Decisions section.
- Evaluate and integrate a pitch/tempo processing library.
  - Decision: SoundTouchJS (soundtouchjs v0.3.0). Integrated into
  WebAudioEngine. setPitch() uses pitchSemitones, setTempo() converts BPM
  delta to a ratio. See Design Decisions for full analysis. TypeScript type
  declarations added at src/soundtouchjs.d.ts.
- [q] MEDIUM: Implement OPFS caching layer for offline support — **DEFERRED
(post–V1)**.
  - The spec still calls for caching audio and lyrics in OPFS for stronger
  offline use; the architecture can accommodate it later. **Decision:** Do not
  block V1 on OPFS; prioritize ZIP import (song onboarding) and core
  playback/editor flows. When we revisit OPFS, include aggressive caching of
  playlist assets, eviction policy (e.g. 10+ days unused), and clear UX when
  files are unavailable offline.
- [q] MEDIUM: Drag-and-drop support in the playlist editor.
  - The spec calls for drag-and-drop of songs into the playlist and reordering
  within the playlist. Currently using buttons and context menus.
  Drag-and-drop should be added for a more natural UX.
- [] MEDIUM: Keyboard shortcuts for all major actions.
  - The spec emphasizes keyboard usability (on-stage use). Need to add keyboard
  handlers for: play/pause (Space), seek (arrows), stop (Esc), volume (+/-),
  tab switching (Ctrl+Tab), etc. Shortcuts should appear in tooltips.
- MEDIUM: Subfolder navigation in the playlist editor.
  - The spec describes navigating into sub-folders of CallerBuddyRoot and
  opening additional editors in new tabs. Currently the editor only shows the
  root folder contents. Need to add folder entry rendering and "open in new
  tab" for sub-folders.
  - DONE: Implemented click-to-navigate folders with breadcrumb navigation, and
  open-in-new-tab via folder context menu. Side-by-side split pane deferred.
  See AI_Logs/Summary.26-02-26.01.subfolderNavigation.md.
- LOW: Help documentation tab.
  - The spec mentions a help tab displaying an HTML help document. This is a
  stub; the infrastructure is there (tab system supports it) but no help
  content exists yet.
  - DONE: Implemented as a hybrid system: in-app Help tab (singleton, accessed
  from hamburger menu and Welcome screen) with tutorial walkthrough, 7 how-to
  guides, keyboard shortcuts reference, and glossary. Also added contextual ?
  help icons for loop controls, pitch/tempo, patter timer, and song import.
  Enhanced tooltips across all components. See AI_Logs/Summary.26-03-26.01.md.

## Coding Standards

- Language best practices, including naming. We want the highest professional
standards.
- We will be use ESLint to catch more errors at compile time. Issues found
ESLint need to be fixed (or at least a bug logged in BACKLOG.md)
- assertions are to be used liberally. Pre and Post conditions on interfaces are
strongly encouraged. They act as useful documentation. Expensive assertions
(that are not constant time, or are on a very high frequency code path) may
have to be commented out (but visible to coders for documentation purposes).
- Generally non-trivial methods on a class need documentation, however, only if
you are providing information that could not be easily guessed by looking at
the names of the method and its parameters. The return value needs to be
documented if it is not obvious from the name of the method.
- Generally important non-local program invariants and the basic architecture
between components need good documentation, typically at the start of a
related file. Cross referencing (pointing the reader to documentation
elsewhere in the code base), is good. Repeating is bad (reference instead).
- There should be a CallerBuddy object that represents the program as a whole,
that gets created at start and dies when the program is closed. All global
variables need to be justified, and no objects should 'leak' in the sense that
they have outlived their usefulness (or will accumulate if the program runs a
long time).
- Reuse: If there are GOOD QUALITY components (e.g. sound processing software)
that exist on the web, or useful UI components they should be preferred IF
THEY ADD ENOUGH VALUE (the work well, were well designed, and do not add large
unnecessary bloat, and the alternative is a lot of locally written code) If
there is any doubt, create a BACKLOG.md issue for it asking for a fix to the
relevant design document.

## Features

- [] SONG HISTORY - We want to keep track of the songs that where played so that
callers can avoid playing any song repeatedly. First we must create two new
data columns in the Songs database: (1) the date the song was last played and
(2) a weighted average how much the song was played over time (a float value).
A song will be considered to be played if the player cursor is at least 90% of
the way through the song before the player was closed. There should be a
'practice' button on the player that will say 'start practice' when the
practice is off and 'stop practice' when the practice is on. The tooltip will
explain that during practice the song is not marked as played for history
purposes. This practice state is app wide (thus if a new song is played the
state will be what it was for the last song), but not persistent restarting
the app will reset it to practice being off.
  - The date the last song was played will be updated when 90% of the song is
  played. In songs.json it will be stored as a date, but it will be displayed
  in the song list editor as a 'last used' column which is the number of days
  ago the song was played (a tooltip on the column will explain this)
  - the weighted average will be computed as weighted exponential window of the
  number of times the song was played in the past. The value of this average
  is normalized to 2 when a song is played exactly once every 28 days forever.
  The weight of the song drops by factor of 1/2 every 28 days. Every time a
  song is played the new weight W is computed as Wnew = 1 + pow(2,
  -delta/28)_Wold where Wold is the previous weight, delta is the number of
  days between the current date and the last time the song was played
  (conveniently stored in the songs data structure). Notice that if a song is
  played every 28 days the weight converges to 1 + 1/2 + 1/4 + 1/8 .... = 1.
  This number should be displayed in the song list editor as a column called
  'played' that has a tooltip that says it is a the weighted average of how
  often the song was played recently. It should take the W number computed
  above, but it should scale it to the current time. e.g. Wdisp = W _ pow(2,
  -delta/28). Where delta is the number of days between the current time and
  the time the song was last played (if there is no last time played Wdisp
  will be 0). The result is that if this displayed number is under 1 then it
  is OK to play the song again without being too repetitive.
- Add the ability to edit the lyrics of a song. The lyrics are assumed to to
be HTML. There should be a button on the song player 'edit lyrics'.  
 If there are no lyrics, then a lyrics html file (named based on the MP3
file) and initialized to with a title, one section and a figure with
sample text. When in editing mode, the left pane which normally just
displays the lyrics becomes an editor for the lyrics. There is a toolbar
across the top with buttons for bolding (selected text) making a header
(of selected text) Making an info block (the blue block), and saving. When
saving the left pane goes back to just displaying the lyrics (and of
course the lyric file will be updated). If there is a nice simple/easy
editor control that already exists, use it, since the details above are
negotiable. The goal is to allow for simple edits without making the code
complex. We are shooting for simplicity in the code. Ideally the editor
does not make many assumptions about the HTML (it does not need to be a
particular style of HTML), but again simplicity is king, most HTML will be
generated by the app itself, and that is the key scenario.
  - DONE: Implemented using native `contenteditable` + `document.execCommand`
  (no new dependencies). Toolbar: Bold, H2, Info, P, Save, Cancel. New lyrics
  creation generates template HTML matching existing file format. See
  AI_Logs/Summary.26-03-25.01.md.
- [] WHen the code is pretty complete, an analysis should be done locate any
lifetime issues. Lifetime issues (e.g. potential leaks) need an explicit
GitHub issue tracking the problem.
- Make sure ESLint is configured correctly for TypeScript (current config is
JS-only and doesn't parse .ts files). Need @typescript-eslint/parser and
@typescript-eslint/eslint-plugin.
  - DONE: TypeScript-aware ESLint wired via `@typescript-eslint/parser` and
  `plugin:@typescript-eslint/recommended`; `npm run lint` covers
  `src/**/*.ts`.
- [] Add Vitest unit tests for core services (song-library.ts, app-state.ts,
audio-engine.ts). The project has Vitest as a design decision but no tests
yet.
- Add Playwright E2E tests for the main workflows (welcome → folder picker →
playlist editor → play).
  - DONE: `e2e/basic-flow.spec.ts` (mocked File System Access API). CI runs
  `npm run e2e` after build/unit tests (see GitHub Actions workflow).
- [] Implement settings persistence for break timer and patter timer durations
(currently settings are loaded but the UI doesn't update settings.json when
the user changes timer values in the playlist-play or song-play views).
- [] Song table column filters (like Google Sheets). Currently only a global
text filter is implemented. Per-column dropdown filters would match the spec.
- [] The playlist editor should show the number of items in the playlist and
total estimated duration.
- [] LOW: Remove in-app debug logging UI/system (currently `Show Logs` modal) once
the app is stable; rely on browser devtools / exported diagnostics instead.

## Bugs

- [] The old `src/my-element.ts` (Vite demo) and `src/welcome-view.ts` (pre-
architecture) files have been deleted. If any import references them, that is
a build error to fix.

## Questions/Clarifications.

- MEDIUM: How should we handle PWA manifest.json and service worker
configuration?
  - Need to decide: manifest structure, service worker caching strategy, offline
  fallback behavior, install prompt handling. This is standard PWA setup but
  should be documented.
  - ANSWER: Decisions documented in Design Decisions (PWA manifest and service
  worker configuration). Minimal PWA files added (manifest.json, sw.js) for
  installable hello-world shell.
- MEDIUM: What is the strategy for testing audio processing (pitch/tempo
modification)?
  - Unit tests for audio processing will need mock audio contexts or test
  fixtures. Need to decide on approach for Vitest tests that exercise Web
  Audio API functionality.
  - ANSWER: move this item to FUTURE.md, we will live without automated tests
  for this for V1 We should have tests that make sure that sounds are
  produced, but we don't need to validate that it is the right sound.
- LOW: Should we use IndexedDB in addition to OPFS for metadata caching?
  - OPFS is for large files. IndexedDB might be better for songs.json and
  settings.json caching. However, OPFS can handle small JSON files too.
  DECISION: Start with OPFS for everything, evaluate if IndexedDB provides
  benefits during implementation.
  - DECISION: It is useful for the files in CallerBuddyRoot be text (json) files
  so that they will be robust (users don't use data). The cache could be a
  database since that is invisible, do whatever is easier.
- LOW: How should we handle audio format support beyond MP3?
  - Spec mentions MP3, but browsers support various formats. Should we support
  OGG, WAV, M4A? Decision:
  - DECISION: Start with MP3 only (matches spec), add format detection and
  support in future versions as desired.
- LOW: What is the maximum size we should cache in OPFS?
  - Need to consider storage quotas and cache eviction policy. The spec mentions
  removing songs unused for 10+ days. Should we also have a total size limit?
  DECISION: Start with time-based eviction only, add size limits if storage
  becomes an issue.
- MEDIUM: What browsers/versions should we target for PWA support?
  - File System Access API support varies by browser. Need to document minimum
  browser versions and fallback behavior for unsupported browsers (e.g.,
  Safari on macOS/iOS). This affects MVP scope.
  - DECISION: Chrome and Edge are the most important. Don't do extra work for
  any other browser for the first Release.
- LOW: How should we handle errors when CallerBuddyRoot becomes unavailable
(network disconnection, folder moved)?
  - Spec mentions offline handling, but what about error UI/UX? Should we show
  clear error messages? Auto-retry? Decision: Show clear error state, allow
  manual retry, fall back to cache gracefully.
  - DECISION: The goal is to work like offline files. Show that you don't have
  connectivity (status warning, graying out), but try to avoid potential
  network access aggressively.
- LOW: Should we validate MP3 file integrity or handle corrupted files
gracefully?
  - What happens if an MP3 file is corrupted or unreadable?
  - DECISION: Handle gracefully with error message, skip corrupted files in song
  list, allow user to fix manually.
- [] MEDIUM: Should we support WAV files in addition to MP3 for testing?
  - The test data generator creates WAV files (since generating MP3 requires an
  encoder library). The song scanner currently accepts .wav as well as .mp3.
  The earlier decision says "MP3 only", but WAV is useful for testing. Keep
  .wav support for now? Or require real MP3 test data?
  - GUESS: Keep .wav support; it costs nothing and is useful for testing. Can be
  restricted later if needed.
- [] LOW: How should the song-play component handle the `unsafeHTML` directive
for lyrics?
  - We're rendering user-provided HTML lyrics with `unsafeHTML` from Lit. This
  is safe for locally stored lyrics (the user controls the files), but worth
  noting as a potential concern if CallerBuddyRoot ever comes from an
  untrusted source. For V1, this is acceptable.
- [] LOW: Should we handle the case where the CallerBuddy singleton's audio
context is suspended ?
  - Browsers require a user gesture before playing audio. The WebAudioEngine
  calls context.resume() on play(), but if this fails, audio won't play. Need
  to verify this works reliably and add user-facing feedback if it doesn't.
- [] MEDIUM: Reconnect flow when stored root handle has no permission.
  - When the app loads and finds a stored directory handle but doesn't have
  permission (user hasn't gestured yet), the welcome screen shows but doesn't
  clearly indicate that the user just needs to re-authorize. Consider adding a
  "Reconnect to [folder name]" button that re-requests permission on the
  stored handle without requiring a new folder picker flow.

