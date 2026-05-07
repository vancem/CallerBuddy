# Summary 2026-05-06.04 — Zoom overshoot: damp + reset touch root font

## Cause

`html { zoom }` scales the whole document; `(pointer: coarse) { :root { font-size: 120% } }`
multiplies every `rem`. Together they compounded → oversized UI and horizontal clipping.

## Fix

- `VIEWPORT_ZOOM_DAMPING` (0.88) applied to the raw zoom factor.
- `html.cb-layout-zoom` while zoom active sets root font to **100%** inside the same
  coarse-pointer media query (`index.css`).
- Clear class when zoom removed.

Version `0.1.0-pre.28`. Files: `main.ts`, `index.css`, `BACKLOG.md`, `package.json`.
