## Summary

Resolved the **Samsung A25 non-fullscreen layout weirdness** by aggressively simplifying the global PWA startup/layout path to match the clean April baseline.

## Outcome

- On the A25, layout now behaves normally in portrait and landscape (no tiny UI / “stuck” wide layout viewport symptoms).
- We removed the global viewport/meta/zoom workaround stack and the shell-wide clamps that depended on it.

## Likely root cause (best current guess)

The strongest signal is that switching the PWA manifest **`display` from `"fullscreen"` to `"standalone"`** appears to avoid the broken runtime mode. Our working hypothesis is that the `"fullscreen"` manifest mode (distinct from the Fullscreen API) was pushing the A25/Chrome WebAPK into a problematic viewport/layout path.

## What we changed (high level)

- **Manifest**: `display: "standalone"` (and made the template match so builds stay consistent).
- **Startup/layout**: removed `applyViewportFix()` / explicit-width viewport rewriting / `html { zoom }` compensation and related CSS clamps.
- **Kept diagnostics**: in-app logging remains so future regressions can be captured quickly.

