# Summary 2026-05-06.08 — Portrait zoom cap raised again (preCapZ vs cap)

## Cause

Device logs: `raw=2.72`, damped **`preCapZ=2.28`**, but **`VIEWPORT_ZOOM_HARD_CAP_PORTRAIT=1.88`**
so `appliedHtmlZoom=1.88`, `hitCap=true`, `approxPerceived≈0.69`, `gapFrom1≈0.31`. UI stayed
visibly undersized with wasted vertical space (letterboxing feel).

## Change

- **`VIEWPORT_ZOOM_HARD_CAP_PORTRAIT = 2.4`** — allows full damped correction (~2.28) with margin.
- Banner / BACKLOG notes updated. Version **`0.1.0-pre.33`**.

`npm run inject-version`, `tsc`, tests pass.
