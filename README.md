# CallerBuddy

CallerBuddy is a Progressive Web App for square dance callers to manage a
collection of music (MP3/WAV) and lyrics (HTML/MD), build playlists for a dance,
and play songs with independent pitch and tempo control while reading lyrics
on-screen. It is loosely inspired by [SqView](https://www.SqView.se/download.php)
but redesigned from scratch as a modern, cross-platform PWA.

**Pre-release access:**
[https://vancem.github.io/CallerBuddy/](https://vancem.github.io/CallerBuddy/)

---

## First-Time Machine Setup

### Prerequisites

- **Node.js** 20 or later
- **npm** (comes with Node)
- **Chrome or Edge** (the File System Access API is Chromium-only)

### Clone and install

```bash
git clone https://github.com/vancem/CallerBuddy.git
cd CallerBuddy
npm install
```

### Install Playwright browsers (for E2E tests)

```bash
npx playwright install chromium
```

### Generate test audio files (optional)

If you want a real folder of test songs to point the app at during manual
testing:

```bash
node scripts/generate-test-data.cjs
```

This creates a `test-data/` folder with 3 short WAV files (2 singing calls
with HTML lyrics, 1 patter with no lyrics).

---

## Development

Start the Vite dev server with hot-module replacement:

```bash
npm run dev
```

Then Ctrl-click the URL shown in the terminal (default `http://localhost:5173`).
The `predev` hook automatically injects the version from `package.json` into
`src/version.ts` and `public/manifest.json`.

---

## Building for Production

```bash
npm run build
```

This runs `tsc` (type-checking production code via `tsconfig.build.json`, which
excludes test files) then `vite build`. Output goes to `dist/`.

To preview the production build locally:

```bash
npm run preview
```

To simulate the GitHub Pages deployment path (serves under `/CallerBuddy/`):

```bash
# Windows
set BASE_PATH=CallerBuddy
npm run build
npm run preview

# macOS/Linux
BASE_PATH=CallerBuddy npm run build
npm run preview
```

---

## Pre-Push Check

Before pushing to `main`, run the same build + test pipeline that CI runs:

```bash
npm run ci
```

This executes `npm run build` (TypeScript type-check + Vite bundle) followed by
`npm test` (all unit tests). If it passes locally, the GitHub Actions build will
pass too.

---

## Testing

### Unit tests (Vitest)

90 tests across 6 files. Runs in ~300ms.

```bash
npm test              # single run
npm run test:watch    # re-run on file changes
```

Tests live alongside the source files they cover (`*.test.ts` next to the
corresponding `*.ts`). They cover:

- **Pure functions:** `format.ts`, `song.ts`, `settings.ts`, `mergeSongs()`
- **Stateful logic:** `AppState` playlist operations, tab management, events
- **Mocked integrations:** `scanDirectory`, `loadSongsJson`, `saveSongsJson`,
  `detectBPM`

### E2E tests (Playwright)

6 tests covering the core happy path. Runs in ~3-4 seconds (Chromium only).

```bash
npm run e2e           # headless run
npm run e2e:ui        # interactive Playwright UI
```

The E2E tests mock the File System Access API entirely in-browser (no real files
needed). They exercise: welcome screen, folder selection, song browsing, playlist
building, and brief playback of both singing calls and patter.

---

## Deployment

CallerBuddy deploys to **GitHub Pages** via a GitHub Actions workflow that runs
on every push to `main`.

1. Bump the version in `package.json` (e.g. `0.1.0-pre.8` to `0.1.0-pre.9`).
2. Commit and push to `main`.
3. The **Deploy preview** workflow builds and deploys automatically.

First-time setup: enable **Settings > Pages > Source: GitHub Actions** in the
repo. See [RELEASE.md](RELEASE.md) for the full process and troubleshooting.

---

## Ramp-Up Reading (in order)

| File | What it covers |
|---|---|
| [CallerBuddySpec.md](CallerBuddySpec.md) | Product specification: requirements, user workflows, UI layout, file conventions. Read this first. |
| [BACKLOG.md](BACKLOG.md) | Active task list, design rules, design philosophy, and all major design decisions with rationale (framework choices, audio engine, state management, etc.). |
| [FUTURE.md](FUTURE.md) | Features deferred from V1 (named playlists, play history, song structure analysis). |
| [RELEASE.md](RELEASE.md) | Versioning scheme and GitHub Pages deployment process. |
| [src/caller-buddy.ts](src/caller-buddy.ts) | Application singleton. Start here for the code: it owns all services, coordinates initialization, and handles the song-play lifecycle. |
| [src/services/app-state.ts](src/services/app-state.ts) | Centralized state with EventTarget-based change notification. Manages tabs, playlist, settings, and playback state. |
| [src/components/app-shell.ts](src/components/app-shell.ts) | Root UI component. Renders the tab bar and dispatches to the view components. |

---

## Project Structure

```
CallerBuddy/
  src/
    caller-buddy.ts           # App singleton (entry point for logic)
    main.ts                   # Bootstrap: creates singleton, mounts <app-shell>
    components/               # Lit web components
      app-shell.ts            #   Root shell with tab management
      welcome-view.ts         #   First-run folder picker
      playlist-editor.ts      #   Song browser + playlist builder
      playlist-play.ts        #   Now Playing view with break timer
      song-play.ts            #   Single-song playback with controls
      tab-bar.ts              #   Chrome-style tab strip
    services/                 # Core services (no UI)
      app-state.ts            #   Centralized state + events
      audio-engine.ts         #   Web Audio + SoundTouchJS playback
      bpm-detector.ts         #   Background BPM analysis
      file-system-service.ts  #   File System Access API wrapper
      song-library.ts         #   Scan folders, load/merge/save songs.json
      logger.ts               #   Logging with levels
    models/                   # Data models
      song.ts                 #   Song interface + parsing utilities
      settings.ts             #   App settings (timers)
    utils/
      format.ts               #   Time formatting helpers
  e2e/
    basic-flow.spec.ts        # Playwright E2E tests
  scripts/
    generate-test-data.cjs    # Creates test WAV/HTML files
    inject-version.cjs        # Stamps version into source + manifest
  public/                     # Static assets (icons, manifest, service worker)
```

---

## Key Technologies

| Technology | Purpose |
|---|---|
| [Lit](https://lit.dev/) 3 | Web component framework for UI |
| [Vite](https://vite.dev/) 7 | Dev server and production bundler |
| [TypeScript](https://www.typescriptlang.org/) 5.9 | Language (strict mode) |
| [SoundTouchJS](https://github.com/AudibleTools/soundtouchjs) | Independent pitch shifting and tempo stretching |
| [web-audio-beat-detector](https://github.com/AudibleTools/web-audio-beat-detector) | Automatic BPM detection |
| [Vitest](https://vitest.dev/) | Unit testing |
| [Playwright](https://playwright.dev/) | E2E browser testing (Chromium) |

---

## AI-Assisted Development

This project uses Cursor with AI assistance. When non-trivial changes are made,
a summary is logged to `AI_Logs/Summary.YY-MM-DD.NN.description.md`. These logs
capture what was changed, which files were touched, and why. See the
[BACKLOG.md](BACKLOG.md) rules section for the full convention.
