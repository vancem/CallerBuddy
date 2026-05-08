## Summary

Adjusted mobile viewport handling to be **conservative on healthy stacks** and only force the explicit-width Samsung/WebAPK workaround when the “broken layout viewport” fingerprint is detected (innerWidth significantly larger than physical edge).

## Why

Logs from `CallerBuddy1` on the Samsung A25 (including installed-from-home-screen) show a normal, healthy mobile viewport (`innerWidth` ≈ 360 in portrait, `visualViewport.scale` ≈ 1.0) without any viewport meta rewriting. This suggests the current app may be unnecessarily forcing explicit-width meta updates on devices/sessions that are already healthy, potentially increasing the chance of entering the broken WebAPK behavior.

## Changes

- `src/main.ts`
  - Removed the global `applyViewportFix()` / `html { zoom }` workaround stack (we’re trying to get back to a “clean” April-style startup).
- `src/index.css`
  - Removed `--cb-max-layout-px` and `cb-layout-zoom` touch scaling adjustments (no longer used).
- `src/components/app-shell.ts`
  - Removed the `max-width` clamp tied to `--cb-max-layout-px`; restored `width: 100vw` host sizing.
- `public/manifest.json`
  - Switched PWA `display` from `fullscreen` to `standalone` to match the known-good April build behavior.

