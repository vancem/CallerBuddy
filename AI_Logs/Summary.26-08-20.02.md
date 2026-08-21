# Summary 26-08-20.02

## What

Items 11–13 of first-release polish (item 14 skipped: no in-app “reload to
update” banner).

11. Editor **Play playlist**, Now Playing **Play song**, row **Play now**.
12. Remaining `window.alert` calls use the in-app OK dialog (`renderAlertDialog`).
13. Shared `CountdownAlarmController` for patter and break timers, with unit tests.

## Why

Play actions were easy to confuse. Native `alert()` did not match other modals.
Patter and break timers were near-duplicate state machines; extracting the
countdown/beep logic keeps the two UIs separate while making tick / 30s beep /
enable-toggle testable.

## Files

- `src/components/playlist-editor.ts`, `playlist-play.ts`, `help-content.md`,
  `e2e/basic-flow.spec.ts` — Play labels
- `src/utils/ui-alert.ts`, `src/styles/chrome.ts`, app-shell, song-play,
  song-onboard, playlist-editor — alert dialog
- `src/controllers/countdown-alarm-controller.ts` (+ tests), song-play,
  playlist-play — shared countdown
