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
- When the cursor Chatbot is modifying files, if it creates a summary in the
  chat (as it usually does) it should also make a markdown file named with the
  convention Summary.YY-MM-DD.NN.md Where NN starts at 01, is a zero padded and
  increases with every new log made that day (So the Summary files are all
  unique and sorted (if fewer than 100)). This allows both humans and the
  chatbot to look back over the past to see the history of what the chatbot did
  and any notes in the summary.

## Design Philosophy

- The overarching design philosophy is: simplicity, readability, testability and
  maintainability are top priorities. Minimalism is good, every framework has to
  justify its inclusion in the app, simple obvious code is best.
- High standards that people who make the
  [Modern Software Engineering](https://www.youtube.com/@ModernSoftwareEngineeringYT)
  would be in evidence.
- Ideally we spend very little time debugging.

## Design Decisions

As important design decision are made, they are logged here, optionally with a
rationale.

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
- We will be Prettier for formatting. Code should confirm its defaults.
- We will be using Vite for building.
- We will be using Vitest for Unit testing.
- We will be using Playwright for UI testing.
- We will use Web Audio API for audio playback and processing (pitch/tempo
  modification).
  - Rationale: Web Audio API is native to browsers and provides the necessary
    capabilities for pitch and tempo modification. For tempo/pitch processing,
    we will evaluate SoundTouchJS (lightweight, purpose-built) or implement
    using Web Audio API's built-in capabilities. Tone.js is an alternative but
    may be overkill for our needs. Decision will be made during implementation
    based on performance and complexity.
- We will use the File System Access API for accessing CallerBuddyRoot folder.
  - Rationale: This is the standard PWA approach for folder access. The API
    provides persistent permission handles that can be stored and reused across
    app sessions, which matches our requirements perfectly.
- We will use OPFS (Origin Private File System) for local caching of audio files
  and metadata.
  - Rationale: OPFS is the modern PWA standard for large file storage and
    provides the performance needed for audio file caching. It's designed for
    this use case and integrates well with File System Access API.
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
  playback from the processing backend. The initial WebAudioEngine implements
  basic playback; pitch and tempo modification are stubbed. A future
  implementation (e.g. SoundTouchJS) can be plugged in without changing the rest
  of the app.
  - Rationale: The spec requires pitch/tempo modification but the right library
    hasn't been chosen yet. Abstracting behind an interface lets us proceed with
    the full data flow while deferring the DSP decision.
- IndexedDB is used to persist the CallerBuddyRoot directory handle across
  browser sessions.
  - Rationale: The File System Access API supports storing handles in IndexedDB.
    This lets the app remember the user's chosen folder without re-prompting.
- PWA manifest and service worker configuration (manifest structure, caching
  strategy, offline fallback, install prompt).
  - Manifest: display mode standalone; icons at 192px and 512px; theme colors
    aligned with app UI; start_url / scope at app root.
  - Service worker caching: static assets cache-first; app shell cached for
    offline; cache versioning via version in cache name so updates invalidate
    old caches.
  - Offline: serve cached app shell when offline; show clear offline indicator;
    queue writes (e.g. to CallerBuddyRoot) for sync when back online.
  - Install prompt: trigger manually from UI (e.g. after folder setup), not
    automatic, so the user controls when they are prompted.
  - Rationale: Matches spec (offline-first, cloud folder, cached audio). Simple
    cache-first for shell gives reliable offline; manual install avoids
    intrusive prompts.

## Open Design Issues

- [x] Decide whether to use the Lit framework (and put the justification in the
      design decision section)
  - Decision: Use Lit. Rationale moved to Design Decisions section.
- [x] Decide how to get the audio software that can modify tempo/pitch, and get
      it integrated into the code base.
  - Decision: Use Web Audio API. Evaluate SoundTouchJS during implementation if
    needed. Rationale moved to Design Decisions section.
- [x] Decide on a logging strategy (do we use a logging package, which one?)
  - Decision: Custom lightweight logger wrapper. Rationale moved to Design
    Decisions section.
- [] HIGH: Evaluate and integrate a pitch/tempo processing library.
  - The AudioEngine interface is in place (src/services/audio-engine.ts) with
    setPitch() and setTempo() stubbed. Need to evaluate SoundTouchJS vs. other
    options and plug a real implementation into the interface. The data flow is
    ready; only the DSP code is missing.
- [] MEDIUM: Implement OPFS caching layer for offline support.
  - The spec requires caching audio and lyrics files locally (OPFS) for offline
    use. The architecture supports this but the caching layer is not yet built.
    Songs added to the playlist should be cached aggressively. Cache eviction
    (10+ days unused) is also needed.
- [] MEDIUM: Drag-and-drop support in the playlist editor.
  - The spec calls for drag-and-drop of songs into the playlist and reordering
    within the playlist. Currently using buttons and context menus.
    Drag-and-drop should be added for a more natural UX.
- [] MEDIUM: Keyboard shortcuts for all major actions.
  - The spec emphasizes keyboard usability (on-stage use). Need to add keyboard
    handlers for: play/pause (Space), seek (arrows), stop (Esc), volume (+/-),
    tab switching (Ctrl+Tab), etc. Shortcuts should appear in tooltips.
- [] MEDIUM: Subfolder navigation in the playlist editor.
  - The spec describes navigating into sub-folders of CallerBuddyRoot and
    opening additional editors in new tabs. Currently the editor only shows the
    root folder contents. Need to add folder entry rendering, ".." navigation,
    and "open in new tab" for sub-folders.
- [] LOW: Help documentation tab.
  - The spec mentions a help tab displaying an HTML help document. This is a
    stub; the infrastructure is there (tab system supports it) but no help
    content exists yet.
- [] LOW: Proper PWA icons (192px, 512px).
  - The manifest currently uses vite.svg as a placeholder. Real CallerBuddy
    icons need to be designed and added.

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

- [] WHen the code is pretty complete, an analysis should be done locate any
  lifetime issues. Lifetime issues (e.g. potential leaks) need an explicit
  GitHub issue tracking the problem.
- [] Make sure ESLint is configured correctly for TypeScript (current config is
  JS-only and doesn't parse .ts files). Need @typescript-eslint/parser and
  @typescript-eslint/eslint-plugin.
- [] Add Vitest unit tests for core services (song-library.ts, app-state.ts,
  audio-engine.ts). The project has Vitest as a design decision but no tests
  yet.
- [] Add Playwright E2E tests for the main workflows (welcome → folder picker →
  playlist editor → play).
- [] Implement settings persistence for break timer and patter timer durations
  (currently settings are loaded but the UI doesn't update settings.json when
  the user changes timer values in the playlist-play or song-play views).
- [] Song table column filters (like Google Sheets). Currently only a global
  text filter is implemented. Per-column dropdown filters would match the spec.
- [] The playSong UI should auto-close when the song finishes AND return to the
  playlistPlay tab. Currently the close happens but the tab activation needs
  testing.
- [] The playlist editor should show the number of items in the playlist and
  total estimated duration.

## Bugs

- [] The old `src/my-element.ts` (Vite demo) and `src/welcome-view.ts` (pre-
  architecture) files have been deleted. If any import references them, that is
  a build error to fix.

## Questions/Clarifications.

- [x] MEDIUM: How should we handle PWA manifest.json and service worker
      configuration?
  - Need to decide: manifest structure, service worker caching strategy, offline
    fallback behavior, install prompt handling. This is standard PWA setup but
    should be documented.
  - ANSWER: Decisions documented in Design Decisions (PWA manifest and service
    worker configuration). Minimal PWA files added (manifest.json, sw.js) for
    installable hello-world shell.
- [x] MEDIUM: What is the strategy for testing audio processing (pitch/tempo
      modification)?
  - Unit tests for audio processing will need mock audio contexts or test
    fixtures. Need to decide on approach for Vitest tests that exercise Web
    Audio API functionality.
  - ANSWER: move this item to FUTURE.md, we will live without automated tests
    for this for V1 We should have tests that make sure that sounds are
    produced, but we don't need to validate that it is the right sound.
- [x] LOW: Should we use IndexedDB in addition to OPFS for metadata caching?
  - OPFS is for large files. IndexedDB might be better for songs.json and
    settings.json caching. However, OPFS can handle small JSON files too.
    DECISION: Start with OPFS for everything, evaluate if IndexedDB provides
    benefits during implementation.
  - DECISION: It is useful for the files in CallerBuddyRoot be text (json) files
    so that they will be robust (users don't use data). The cache could be a
    database since that is invisible, do whatever is easier.
- [x] LOW: How should we handle audio format support beyond MP3?
  - Spec mentions MP3, but browsers support various formats. Should we support
    OGG, WAV, M4A? Decision:
  - DECISION: Start with MP3 only (matches spec), add format detection and
    support in future versions as desired.
- [x] LOW: What is the maximum size we should cache in OPFS?
  - Need to consider storage quotas and cache eviction policy. The spec mentions
    removing songs unused for 10+ days. Should we also have a total size limit?
    DECISION: Start with time-based eviction only, add size limits if storage
    becomes an issue.
- [x] MEDIUM: What browsers/versions should we target for PWA support?
  - File System Access API support varies by browser. Need to document minimum
    browser versions and fallback behavior for unsupported browsers (e.g.,
    Safari on macOS/iOS). This affects MVP scope.
  - DECISION: Chrome and Edge are the most important. Don't do extra work for
    any other browser for the first Release.
- [x] LOW: How should we handle errors when CallerBuddyRoot becomes unavailable
      (network disconnection, folder moved)?
  - Spec mentions offline handling, but what about error UI/UX? Should we show
    clear error messages? Auto-retry? Decision: Show clear error state, allow
    manual retry, fall back to cache gracefully.
  - DECISION: The goal is to work like offline files. Show that you don't have
    connectivity (status warning, graying out), but try to avoid potential
    network access aggressively.
- [x] LOW: Should we validate MP3 file integrity or handle corrupted files
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
  context is suspended?
  - Browsers require a user gesture before playing audio. The WebAudioEngine
    calls context.resume() on play(), but if this fails, audio won't play. Need
    to verify this works reliably and add user-facing feedback if it doesn't.
- [] MEDIUM: Reconnect flow when stored root handle has no permission.
  - When the app loads and finds a stored directory handle but doesn't have
    permission (user hasn't gestured yet), the welcome screen shows but doesn't
    clearly indicate that the user just needs to re-authorize. Consider adding a
    "Reconnect to [folder name]" button that re-requests permission on the
    stored handle without requiring a new folder picker flow.
