# Summary – Fix mobile fullscreen & folder-connect activation conflict

**Date:** 2026-02-28

## What was done

1. Fixed the mobile fullscreen logic in `app-shell.ts` that was supposed to hide
   the browser's URL bar on small screens but was silently failing.
2. Fixed the "User activation is required to request permissions" error when
   connecting to a folder — caused by `requestFullscreen()` consuming the
   transient user-activation token before `requestPermission()` could use it.
3. Changed fullscreen to fire-once: it attempts on the first eligible click and
   then removes the listener, so it never re-triggers on tab switches or other
   interactions.

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

## Root cause (tab-switch fullscreen re-trigger)

The persistent click handler was calling `requestFullscreen()` on every
non-interactive click.  Switching tabs involves clicking non-interactive areas,
which repeatedly re-entered fullscreen even after the user had exited it.

## Changes

### `src/components/app-shell.ts`

- **Screen-size detection, not device detection** — replaced `isPhone()` (media
  query for `hover: none` / `pointer: coarse`) with `isSmallScreen()`: a pure
  viewport-dimension check (either dimension < 800 CSS px ≈ 50 chars of default
  text).

- **Fire-once fullscreen** — `setupFullscreenOnFirstClick()` registers a click
  listener that removes itself after the first eligible (non-interactive, small
  screen) click.  If the screen is large at the time of first click, the listener
  also removes itself without requesting fullscreen.  The app never re-requests
  fullscreen after that.

- **Scoped to the component** — handler on `this` (the host element) instead
  of `document`.

- **Skips interactive elements** — `clickedInteractiveElement()` walks
  `composedPath()` looking for `<button>`, `<a>`, `<input>`, `<select>`,
  `<textarea>`.  When the user clicks one of these, the listener stays but
  does not fire, preserving activation for APIs those elements may trigger.

- **PWA standalone skip** — `isStandalonePWA()` check at setup time; if running
  as an installed PWA, no listener is registered at all.

- **Vendor-prefix support** — `webkitRequestFullscreen` / `webkitFullscreenElement`
  / `webkitExitFullscreen` fallbacks (also applied to `onClose()`).

### `src/caller-buddy.ts`

- **Reordered `setRoot()`** — `ensurePermission()` now runs *before* awaiting
  the IndexedDB persist.  The persist is started immediately (fire-and-forget
  style) so it still begins as early as possible, but `ensurePermission` gets the
  user-activation token while it is freshest.  We `await stored` before
  `activateRoot()` so the handle is guaranteed persisted before proceeding.
