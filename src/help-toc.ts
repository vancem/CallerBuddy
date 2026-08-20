/** IDs match GitHub/GFM heading slugs from help-content.md (marked-gfm-heading-id). */
export interface HelpTocEntry {
  id: string;
  title: string;
  indent?: boolean;
}

export const HELP_TOC: HelpTocEntry[] = [
  { id: "welcome-to-callerbuddy", title: "Welcome to CallerBuddy" },
  { id: "expected-workflow", title: "Expected Workflow" },
  { id: "first-time-setup", title: "First Time Setup", indent: true },
  { id: "the-app-menu", title: "The App Menu" },
  { id: "playlist-editor", title: "Playlist Editor" },
  { id: "now-playing", title: "Now Playing" },
  { id: "the-break-timer", title: "The Break Timer", indent: true },
  { id: "song-player", title: "Song Player" },
  { id: "controlling-where-the-sound-goes", title: "Controlling where the sound goes", indent: true },
  { id: "song-player-layout", title: "Song Player Layout", indent: true },
  { id: "adjust-pitch-and-tempo", title: "Adjust pitch and tempo", indent: true },
  { id: "the-song-progress-bar", title: "The Song Progress Bar", indent: true },
  { id: "the-left-pane-in-the-song-player", title: "The left pane", indent: true },
  { id: "setting-loop-points-for-patter", title: "Setting loop points for patter", indent: true },
  { id: "the-patter-timer", title: "The patter timer", indent: true },
  { id: "edit-lyrics", title: "Edit lyrics" },
  { id: "lyrics-markdown", title: "Lyrics Markdown", indent: true },
  { id: "callerbuddy-security", title: "CallerBuddy Security" },
  { id: "running-callerbuddy-outside-the-browser", title: "Installing / outside the browser" },
  { id: "cloud-storage-for-your-songs", title: "Cloud Storage for your Songs" },
  { id: "offline-callerbuddy", title: "Offline CallerBuddy" },
  { id: "adding-songs-to-callerbuddy", title: "Adding Songs to CallerBuddy" },
  { id: "importing-songs", title: "Importing songs", indent: true },
  { id: "subfolders-in-callerbuddy", title: "SubFolders in CallerBuddy" },
  { id: "appendix", title: "Appendix" },
  { id: "how-callerbuddy-stores-the-data-it-needs", title: "How CallerBuddy Stores Data", indent: true },
  { id: "how-the-played-average-is-calculated", title: "How the Played Average is Calculated", indent: true },
  { id: "keyboard-shortcuts", title: "Keyboard Shortcuts", indent: true },
];
