# Summary: In-App Help Documentation System

**Date:** 2026-03-26

## What was done

Added a hybrid documentation system to CallerBuddy: an in-app Help tab with
scenario walkthroughs, enhanced tooltips across the app, and contextual `?`
help icons for complex features. The approach was informed by the Diataxis
documentation framework and research on in-app contextual help best practices.

### Help Tab Infrastructure

- Added `Help: "help"` to the `TabType` enum in `app-state.ts`.
- Created `help-view.ts`, a new Lit component rendered as a singleton tab.
  It has a sidebar table of contents (14 entries) with smooth scroll-to-section
  navigation, and a responsive layout (sidebar hides on narrow screens).
- Wired into `app-shell.ts`: import, "Help" menu item in the hamburger menu,
  `onHelp()` handler, and `TabType.Help` case in `renderTab()`.
- Added a "View Help & Walkthroughs" link on the Welcome screen
  (`welcome-view.ts`).

### Help Content (Diataxis-informed structure)

The help-view contains:

- **Tutorial:** "Your First Dance with CallerBuddy" — a 3-part walkthrough
  (folder setup, building a playlist, playing a dance).
- **7 How-to Guides:** importing from ZIP, importing from folder, playlists,
  pitch/tempo, loop points, break timer, lyrics editing, categories/rank
  and filtering.
- **Keyboard Shortcuts Reference:** 4 tables covering global, Now Playing,
  Song Player, and Loop Controls shortcuts.
- **Glossary:** 10 terms (CallerBuddy folder, label, patter, singing call,
  playlist, loop start/end, break timer, BPM, rank, categories).

### Tooltip Audit

- `playlist-play.ts`: Added tooltip to ♪/♫ type indicators and break timer
  enabled checkbox.
- `song-onboard.ts`: Added tooltips to Import/Cancel buttons, Label/Title
  inputs, and toggle-contents button.
- `app-shell.ts`: Added tooltip to the Help menu item.

### Contextual `?` Help Icons

Added toggleable `?` help buttons with expandable inline help panels:

- `song-play.ts`: Loop Controls, Patter Timer, and Volume/Pitch/Tempo.
- `song-onboard.ts`: Import review heading.

Each panel provides a concise explanation of the feature and relevant keyboard
shortcuts, dismissible by clicking the `?` again.

## Files touched

| File | Change |
|------|--------|
| `src/services/app-state.ts` | Added `Help` to `TabType` enum |
| `src/components/help-view.ts` | **New file** — full help documentation component |
| `src/components/app-shell.ts` | Import help-view, Help menu item, `onHelp()`, render case |
| `src/components/welcome-view.ts` | "View Help & Walkthroughs" link, `openHelp()` method |
| `src/components/song-play.ts` | 3 contextual `?` help icons + panels, CSS for help UI |
| `src/components/song-onboard.ts` | 1 contextual `?` help icon + panel, tooltips, CSS |
| `src/components/playlist-play.ts` | Tooltips on ♪/♫ indicators and break timer checkbox |

## Why

The CallerBuddy spec calls for both aggressive tooltips and a help tab
displaying documentation. The app was usable but lacked guidance for complex
multi-step workflows (importing songs, setting up loops, running a dance).
A hybrid approach — contextual help for "what does this do?" and a Help tab
for "how do I accomplish X?" — was chosen because it works offline (critical
for CallerBuddy's use at dances), aligns with the spec, and keeps the
maintenance burden manageable.

## Verification

- TypeScript compiles cleanly (`tsc --noEmit`).
- All 146 unit tests pass (`vitest run`).
- No linter errors on any modified files.
