# Summary 2026-05-06.06 — Portrait zoom cap raised (orientation-aware)

## Cause

Logs showed `raw≈2.72`, `visualViewport.scale≈0.367`, but zoom hit **`cap=1.14`**.
Effective appearance stayed ~`0.37 × 1.14 ≈ 0.42` vs natural — still tiny. The shell
`max-width` fix prevents wide-row clipping; the global **1.14** cap was chosen before
that and no longer matched portrait needs.

## Change

- **`VIEWPORT_ZOOM_HARD_CAP_PORTRAIT = 1.88`**, **`VIEWPORT_ZOOM_HARD_CAP_LANDSCAPE = 1.18`**
  — cap chosen from orientation in `syncZoomCompensation`.
- **`VIEWPORT_ZOOM_UNDER_BIAS = 0.95`** (was 0.93).

Portrait zoom line logs `cap=… portrait=true`.

Version `0.1.0-pre.31`.
