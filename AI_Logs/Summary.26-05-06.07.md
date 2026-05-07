# Summary 2026-05-06.07 — Document `[viewport-math]` diagnostics

## Cause

Samsung/WebAPK sizing issues need one canonical log line tying physical `screen`,
bogus `innerWidth`, `visualViewport.scale`, ideal `1/scale`, damped zoom,
applied html zoom, cap hit, and heuristic `gapFrom1` (positive ⇒ still too small).

## Change

- **`src/services/env-log.ts`** — comment pointing at **`[viewport-math]`** in `main.ts`
  as the first place to tune WebAPK sizing.
- **`BACKLOG.md`** — diagnostics bullet expanded with field meanings.
- Version **`0.1.0-pre.32`**.

`npm run inject-version`, `tsc`, tests pass.
