# Summary – Fix mobile fullscreen & folder-connect activation conflict

**Date:** 2026-02-28

## What was done

1. Fixed the mobile fullscreen logic in `app-shell.ts` that was supposed to hide
   the browser's URL bar on small screens but was silently failing.
2. Fixed the "User activation is required to request permissions" error when
   connecting to a folder — caused by `requestFullscreen()` consuming the
   transient user-activation token before `requestPermission()` could use it.

## Root cause (original fullscreen code)

The original implementation registered both `click` and `touchstart` listeners and
removed **both** on the very first event.  On mobile, `touchstart` fires before
`click`; if the browser rejected the fullscreen request from `touchstart`, the
`click` listener was already gone.  `.catch(() => {})` swallowed the error.

## Root cause (folder-connect error)

`requestFullscreen()` **consumes** the browser's transient user-activation token.
When both fullscreen and folder-reconnect ran on the same click, the activation was
already gone by the time `FileSystemHandle.requestPermission()` was called.
Additionally, `setRoot()` awaited `storeRootHandle()` (IndexedDB) *before* calling
`ensurePermission()`, adding unnecessary delay before using the activation.

## Changes

### `src/components/app-shell.ts`

- **Screen-size detection, not device detection** — replaced `isPhone()` (media
  query for `hover: none` / `pointer: coarse`) with `isSmallScreen()`: a pure
  viewport-dimension check (either dimension < 800 CSS px ≈ 50 chars of default
  text).

- **Standard lifecycle click handler** — `_boundClick` follows the same
  `connectedCallback` / `disconnectedCallback` pattern as `_boundKeydown`.
  No transient add/remove.

- **Scoped to the component** — handler on `this` (the host element) instead
  of `document`.

- **Skips interactive elements** — added `clickedInteractiveElement()` which
  walks `composedPath()` looking for `<button>`, `<a>`, `<input>`, `<select>`,
  `<textarea>`.  When the user clicks one of these, fullscreen is *not* requested,
  preserving the activation token for APIs those elements may trigger (e.g.
  `showDirectoryPicker`, `requestPermission`).

- **PWA standalone skip** — `isStandalonePWA()` avoids requesting fullscreen when
  browser chrome is already absent.

- **Vendor-prefix support** — `webkitRequestFullscreen` / `webkitFullscreenElement`
  / `webkitExitFullscreen` fallbacks (also applied to `onClose()`).

### `src/caller-buddy.ts`

- **Reordered `setRoot()`** — `ensurePermission()` now runs *before* awaiting
  the IndexedDB persist.  The persist is started immediately (fire-and-forget
  style) so it still begins as early as possible, but `ensurePermission` gets the
  user-activation token while it is freshest.  We `await stored` before
  `activateRoot()` so the handle is guaranteed persisted before proceeding.
