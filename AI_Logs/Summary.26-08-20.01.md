# Summary 26-08-20.01

## What

First-release polish as ten focused commits, then a version bump to
`0.1.0-pre.301`. Copy, error banners, Reset confirmation, help/docs alignment,
unused HTML scraper removal, Markdown test-data lyrics, shared Lit chrome CSS,
shared helpers, and E2E coverage for failed audio load plus folder import.

## Why

V1 needed user-visible failures, safer Reset, docs that match the shipped
product, less duplicated chrome/helpers, and E2E that exercises the new error
and import paths instead of a brittle CSS class check.

## Commits

1. User-visible copy: filter placeholder, rank help, Full Screen casing
2. Banner when audio or folder load fails
3. Confirm before Reset CallerBuddy
4. In-app help shortcuts and folder naming
5. README, BACKLOG, FUTURE, and spec vs shipped V1
6. Retire unused HTML lyrics scraper; shared `toTitleCase` / `escapeHtml`
7. `generate-test-data` writes Markdown lyrics
8. Shared ctx-help, overlay, and button chrome CSS (`src/styles/chrome.ts`)
9. Shared `openHelpSection`, `decodePathSegment`, onboard guard, `formatCountdown`
10. E2E: failed audio load, Import Song from Folder smoke; drop class-name test

## Files (later commits)

- `src/styles/chrome.ts`, `src/utils/ui-help.ts`, `src/utils/text.ts`
- Lit views: playlist editor/play, song play/onboard, welcome, app-shell
- `e2e/basic-flow.spec.ts`, `package.json`, `src/version.ts`
