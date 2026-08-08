# Summary 26-08-07.02

## What

After the CallerBuddyRoot is activated and the playlist editor opens, the
Welcome tab is force-closed so it leaves the tab list and the in-app back
stack.

## Why

On Android, reconnect leaves Welcome open underneath the editor. System Back
then returned to the reconnect Welcome even though the folder handle was
already authorized. Welcome is only for first launch / permission gesture;
Reset CallerBuddy is the path back to a fresh Welcome.

## Files

- `src/caller-buddy.ts` — `activateRoot` dismisses Welcome after opening the
  editor
- `src/services/app-state.ts` — `closeTab` / `closeTabByType` accept `{ force }`
  so non-closable Welcome can be dismissed programmatically
- `src/services/app-state.test.ts` — force-close + back-stack scrub coverage
- `src/components/welcome-view.ts` — comment updated
- `BACKLOG.md` — design note for dismiss-after-activate
