# Summary 2026-05-06.01 — Startup fullscreen dialog & documentation

## What changed

- **Fullscreen UX:** Removed global capture-phase auto-fullscreen and all
  re-register-on-exit logic (`_closingApp`, `_boundAutoFs`, `describeTarget`).
  Touch installed PWAs now see a **one-time** startup dialog (“Enter full screen” /
  “Not now”) stored in `localStorage` key `callerbuddy.fsStartupPrompt`. Primary
  button calls `requestFullscreen()` with an isolated user gesture so File System
  `requestPermission()` on Reconnect is not starved.

- **Readable without FS:** Emphasized in UI copy and docs that `applyViewportFix()`
  in `main.ts` keeps text usable even when API fullscreen is off or exits.

- **Documentation:** Added a large banner comment at the top of `src/main.ts`
  summarizing Samsung/Android WebAPK quirks; expanded `BACKLOG.md` under Design
  Decisions with the same themes; cross-linked `env-log.ts` to those notes.

- **Version:** `0.1.0-pre.24`.

## Files touched

- `src/main.ts` — documentation banner; viewport fix unchanged in behavior.
- `src/components/app-shell.ts` — startup modal, removed state machines for FS.
- `src/services/env-log.ts` — pointer to main/BACKLOG.
- `BACKLOG.md` — mobile viewport & fullscreen subsection.
- `package.json` — version bump.
- `src/version.ts` — via `npm run inject-version`.
