# Summary 26-08-07.01

## What

Documented the non-obvious Windows-vs-phone startup folder-permission quirk in
`BACKLOG.md` Design Decisions, and closed the stale open issue about adding a
reconnect button (already implemented).

## Why

On desktop, a stored CallerBuddyRoot handle often still has `"granted"`
permission at `queryPermission` time, so init skips Welcome and opens the
playlist editor. On Android, permission typically falls back to `"prompt"` after
reload; `requestPermission` needs a user gesture, so Welcome must show
**Reconnect to this folder**. That rationale was only a one-liner before and
easy to forget.

## Files

- `BACKLOG.md` — expanded IndexedDB / startup reconnect design decision; marked
  reconnect open issue done.
