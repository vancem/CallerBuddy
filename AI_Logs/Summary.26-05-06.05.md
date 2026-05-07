# Summary 2026-05-06.05 — Clip fix: shell max-width + zoom hard cap

## Root cause

`html { zoom > 1 }` **increases** laid-out size in Blink. With a stuck-wide
`innerWidth` (~980), zoom ~2× expanded the flex row past the physical screen, so
the hamburger and text clipped on the right.

## Fix

- Set **`--cb-max-layout-px`** on `:root` from `screen` + orientation (`syncRootMaxLayoutPx` in `applyFix`).
- **`app-shell` `:host`**: `width: 100%`, `max-width: min(100vw, var(--cb-max-layout-px))`, `margin-inline: auto`.
- **`VIEWPORT_ZOOM_HARD_CAP = 1.14`** — replaces unbounded zoom (was up to 4×).

`index.css`: default `--cb-max-layout-px: 100vw`.

Version `0.1.0-pre.30`.
