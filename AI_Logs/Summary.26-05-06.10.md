# Summary 2026-05-06.10 — Zoom policy: 2% horizontal undershoot; vertical tolerance noted

## Policy

- **Horizontal:** target **`vv.scale×htmlZoom ≈ 0.98`** (~2% undershoot vs full `1/scale`) via **`VIEWPORT_ZOOM_UNDER_BIAS=0.98`**, `DAMPING=1`.
- **Vertical:** uniform `html` zoom cannot trim height separately; document **~10% portrait / ~15% landscape** acceptable deviation from ideal height vs OS chrome.

## Change

- **`VIEWPORT_ZOOM_HARD_CAP_PORTRAIT=2.75`**, **`LANDSCAPE=1.42`** so `raw×0.98` is not capped on Samsung stuck-layout cases.
- **`[viewport-math]`** target text **~0.98**; cap warn threshold **0.96**.

Version **`0.1.0-pre.35`**.
