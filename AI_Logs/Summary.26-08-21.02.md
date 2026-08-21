# Summary 26-08-21.02

## What

Stopped the production service worker from taking over an already-open
CallerBuddy window the moment a new version deploys. New workers wait until
the page is idle, then the page reloads into the new version.

## Why

After the 1.0.0 push, existing installs hung until the app or browser window
was restarted. That matches `skipWaiting()` + `clients.claim()` in
`sw.template.js`: the new worker activated immediately, deleted
`callerbuddy-v0.1.0-pre.301` (and any other old cache names), and left the
still-running 0.1.0-pre.301 page fetching hashed assets that were gone. A
restart loaded the new shell cleanly.

The 1.0.0 worker still has that takeover behavior, so this fix also avoids
repeating the hang when *this* build reaches those windows: they never post
`skipWaiting`, so the new worker stays waiting until the user closes the app.

## Files

- `public/sw.template.js` — install only precaches; `skipWaiting` is
  message-driven; claim then delete old caches; never return `undefined` for
  navigations; do not intercept `sw.js`
- `src/services/pwa-update.ts` — register SW, activate waiting worker when
  idle, reload once on `controllerchange`
- `src/services/pwa-update.test.ts`
- `src/main.ts` — idle = no current song and audio not playing
- `BACKLOG.md` — design decision for PWA update handoff
