# Subfolder Navigation Feature Evaluation

Summary of evaluation of the three subfolder-navigation features (MEDIUM backlog item), written for clean/simple implementation and cost understanding.

---

## Feature 1: Click-to-navigate folders (the MVP)

**What it is:** Something in the UI that represents a folder; click it to make that the folder being explored (like in file explorer GUIs).

### What's easy

- **Folder entries already exist in the data.** `listDirectory()` in `file-system-service.ts` already returns `DirEntry[]` with `kind: "directory"`. The scanner just ignores them today.
- **Getting a subfolder handle is trivial.** The File System Access API has `dirHandle.getDirectoryHandle(name)` — it's already declared in your type definitions, just never called.
- **Song scanning already works per-folder.** `scanDirectory()` is explicitly designed to operate on one folder at a time (there's even a comment saying so). You just pass it a different handle.
- **The song table rendering is straightforward Lit.** Adding a folder row type to the table is a small template change.

### What's moderately hard

- **The playlist editor needs new state: a `currentFolderHandle`.** Right now it has none — it just reads from the global `state.songs`. You'll need to add a folder handle (and probably a breadcrumb path for display), and when the user clicks a folder, you call `getDirectoryHandle()`, scan that folder, and update the editor's local song list. This is the core of the feature but it's well-scoped.
- **Where do songs.json files live?** Today there's one `songs.json` at the root. If a user navigates into `subfolder/`, should that folder have its own `songs.json`? Or does the root one track everything with relative paths? The simplest answer for now: **one songs.json per folder that has MP3s**, which matches how `scanDirectory` + `loadAndMergeSongs` already work (they operate on a single directory handle). This means each folder is self-contained.
- **Song paths in the playlist.** When a song from a subfolder gets added to the playlist, you need enough information to find and play it later (you need the directory handle or a path). Today `Song.musicFile` is just a filename. You'd need to either store a relative path from the root, or stash the directory handle on the Song object. Storing the handle is simpler and more robust (no path reconstruction needed).

### What's hard

- **Not much, honestly.** This is the cleanest feature of the three. The main risk is making a design mistake in how you associate songs with their folder handles, which could make Feature 2 harder later. But if you keep it simple — each playlist editor instance holds its own `dirHandle` and scans that folder — it's a clean, contained change.

### Estimated scope

~4–6 places to change: `playlist-editor.ts` (folder rows + navigation state), `song-library.ts` (minor: accept any handle, which it basically does), `Song` model (add a `dirHandle` or `folderPath` field), `caller-buddy.ts` (wire up the initial handle). Small feature.

---

## Feature 2: Open folder in its own tab

**What it is:** Open the folder in its own tab; that tab operates independently but shares the playlist being created.

### What's easy

- **The tab system already supports it structurally.** `TabInfo` has a `data` field and the system can hold multiple tabs. `app-shell.ts` already switches on `TabType` to render content.
- **The playlist is already global.** `state.playlist` is shared — any editor that adds to it automatically shares with all others. No extra work for shared playlist.
- **Playlist change events already exist.** `PLAYLIST_CHANGED` is already fired and listened to by all editors. Multiple editors will stay in sync for free.

### What's moderately hard

- **Switching from singleton to multi-instance tabs.** Today, `openSingletonTab(TabType.PlaylistEditor, ...)` ensures exactly one editor. You'd switch to `openTab()` instead and give each tab a unique ID (e.g., based on folder path). This is a small change in `caller-buddy.ts` and `app-state.ts`, but you need to think about: when do you prevent duplicates? (Probably: don't open two tabs for the same folder.)
- **Each tab needs its own component instance with its own state.** Currently `app-shell.ts` renders a single `<cb-playlist-editor>`. With multiple editor tabs, you need to render one per tab and pass the folder handle as a property. Lit handles this fine, but the rendering logic in `app-shell.ts` needs updating from a simple switch to a loop/map.
- **Tab titles and identity.** Each tab needs to show the folder name. This already works via `TabInfo.title`, just needs to be set correctly.

### What's hard

- **Component instance lifecycle.** When a tab is closed, its `<cb-playlist-editor>` instance needs to be torn down cleanly (event listeners removed, etc.). Today there's only one and it's basically permanent. With multiple, you need to handle creation and destruction properly. Lit's `disconnectedCallback` helps, but you need to be careful with the event subscriptions in `connectedCallback`/`disconnectedCallback`.
- **Songs state becomes per-editor, not global.** Today `state.songs` is the single song list. With multiple editors, each viewing a different folder, you can't use a single global songs array. Each editor needs its own song list. The cleanest approach: remove `state.songs` as global state and make each editor instance own its songs (loaded from its folder handle). The global `SONGS_LOADED` event would need to change to per-instance, or each editor just manages its own load.

### Estimated scope

Medium. The tab system changes are small, but refactoring songs from global to per-editor is a meaningful architectural change. It touches `app-state.ts`, `playlist-editor.ts`, `app-shell.ts`, and `caller-buddy.ts`. Probably a day's work if Feature 1 is already done.

---

## Feature 3: Side-by-side editors (visible at same time)

**What it is:** Those tabs can be side-by-side (visible at the same time).

### What's easy

- **If Feature 2 is done, the components are already independent.** Each editor already has its own folder handle and song list. Putting two side-by-side is "just layout."

### What's moderately hard

- **The shared playlist panel.** The spec says both editors operate on the same playlist and the playlist UI is on the left. If two editors are side-by-side, should there be one shared playlist panel on the left and two song browsers on the right? This is a layout/UX decision that changes the component structure. Today the playlist panel is inside `<cb-playlist-editor>`. You'd need to extract it into its own component, or have one editor "own" the playlist display while the other just has the song browser. Either way, it's a refactor of the editor's template.
- **The "within one tab" part.** The spec says you right-click a folder and it opens "to the right of the current playlist editor but in the same tab." This means one tab contains two editors with independent close buttons (X on a title bar). This is a layout container concept — a split pane or panel host inside a single tab. It's not rocket science but it's a new component that doesn't exist today.

### What's hard

- **Responsive layout.** Two side-by-side editors each with a song table need horizontal space. On a laptop this is fine; on a phone it's essentially unusable. You'd need responsive breakpoints or a strategy for narrow screens (maybe fall back to separate tabs on mobile).
- **The shared-vs-separate playlist panel.** This is the biggest design question. The spec says "they will both be operating on the same playlist." If the playlist is shown once (shared left panel), the layout is: `[playlist | editor1 | editor2]`. If each has its own playlist view, they show the same data but take more space. The clean answer is probably: one shared playlist panel on the far left, extracted into its own component.
- **Close semantics.** Each editor has its own title bar with an X. When one closes, the other expands to fill the space. When both close, the tab itself closes. This is manageable but needs thought.

### Estimated scope

Significant. Requires a new split-pane container component, extracting the playlist panel, and handling the open/close lifecycle of sub-panels within a tab. This is probably the largest single piece of UI work. Probably 2–3 days.

---

## Summary table

| Feature | Core difficulty | Biggest risk | Depends on |
|--------|-----------------|--------------|------------|
| **1. Click-to-navigate** | Low | Getting Song-to-folder association right so it doesn't need rework later | Nothing |
| **2. Folder in own tab** | Medium | Refactoring songs from global to per-editor state | Feature 1 |
| **3. Side-by-side** | Medium–High | Playlist panel extraction + split-pane layout | Feature 2 |

---

## Recommendation

**Feature 1 is clean and small.** The main thing to get right is: put a `dirHandle: FileSystemDirectoryHandle` on each `Song` (or on the editor instance), and make each editor responsible for its own song list. If you do that, Feature 2 falls out naturally.

**The key architectural decision to make up front** (even for Feature 1): should `state.songs` remain global, or should each editor own its songs? If you make it per-editor now, Features 2 and 3 are much easier. If you leave it global, Feature 2 requires a painful refactor. Recommendation: make it per-editor from the start — the playlist editor component holds its own `songs: Song[]` as internal state, loaded from its `dirHandle`. The global `state.songs` goes away (or becomes "songs from the root editor" only for backwards compatibility).
