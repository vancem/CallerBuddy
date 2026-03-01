# Summary – Replace auto-fullscreen with explicit menu toggle

**Date:** 2026-02-28

## What was done

Replaced all automatic fullscreen logic with an explicit "Full Screen" / "In
Window" toggle in the hamburger menu.

## Why

The Fullscreen API requires a user-activation token (from a click), and that
token is single-use — it's consumed by whichever API uses it first. Automatic
fullscreen on click conflicted with file-picker / permission APIs that need the
same token, and various heuristics (time windows, interactive-element detection)
proved fragile. An explicit menu item is simple, robust, and under user control.

## Changes

### `src/components/app-shell.ts`

- **Removed** all automatic fullscreen logic: `_fullscreenDone`,
  `_fullscreenDeadline`, `FULLSCREEN_WINDOW_MS`, `onClickFullscreen()`,
  `clickedInteractiveElement()`, `isSmallScreen()`, `isStandalonePWA()`,
  `SMALL_SCREEN_PX`, and the click listener.

- **Added** `toggleFullscreen()` — enters or exits fullscreen with vendor-prefix
  support (`webkitRequestFullscreen` / `webkitExitFullscreen`).

- **Added** `isFullscreen()` helper using `fullscreenElement` with webkit
  fallback.

- **Added** `fullscreenchange` event listener so the menu label updates when
  fullscreen state changes (e.g. user swipes status bar to exit).

- **Added** menu item in `renderMenu()` that shows "Full Screen" or "Show
  Browser" depending on current state.

- **Simplified** `onClose()` to use `isFullscreen()` helper.

### `src/caller-buddy.ts`

- **Reordered `setRoot()`** (from earlier in this session) —
  `ensurePermission()` runs before awaiting the IndexedDB persist so the
  permission request gets the user-activation token while it is freshest.
