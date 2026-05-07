# Summary 2026-05-06.02 — WebAPK viewport: `html` zoom fallback

## Problem

Logs showed `vpMeta="width=360"` while `innerWidth` stayed 980 and
`visualViewport.scale` ~0.37: the meta tag updated but Chrome WebAPK did not
change the layout viewport. Reflow “sandwiches” had no effect.

## Change

- Removed sandwich logic; added **`document.documentElement.style.zoom`** when
  `innerWidth` > ~112% of the expected physical edge (`screen` + orientation),
  with `zoom = min(inner/expected, 4)`. Property removed when inner matches
  (e.g. Fullscreen API path).
- Documented in `main.ts` banner and `BACKLOG.md`.
- Version `0.1.0-pre.26`.

## Files

`src/main.ts`, `BACKLOG.md`, `package.json`, `src/version.ts` (inject-version).
