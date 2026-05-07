# Summary 2026-05-06.09 — Horizontal fill: zoom undertune + welcome padding

## Cause

User priority: **horizontal** margins should match the glass (few px); vertical loss OK.

Logs showed **`gapFrom1≈0.164`** — not OS chrome; mostly **`damp×under=0.88×0.95≈0.836`** vs full
neutralize (`scale×zoom→1`). Welcome screen also had **`padding: 2rem`** on `:host` (~32px/side in
CSS terms), a large fraction of ~360px logical width.

## Change

- **`VIEWPORT_ZOOM_DAMPING = 1`**, **`VIEWPORT_ZOOM_UNDER_BIAS = 0.95`** → ~5% undershoot vs `1/scale`;
  **`VIEWPORT_ZOOM_HARD_CAP_PORTRAIT = 2.7`** for `preCapZ≈2.58`.
- **`[viewport-math]`** logs **`damp×under`** and clarifies perceived-scale formula.
- **`welcome-view`**: default full width with **`padding: … clamp(10px, 3vw, 18px)`**; from **`min-width: 600px`**
  restore centered **`max-width: 560px`** + **`2rem`** padding.

Version **`0.1.0-pre.34`**. Tests pass.
