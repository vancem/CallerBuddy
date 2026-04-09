<div id="tutorial"></div>

# Your First Dance with CallerBuddy

This walkthrough takes you from a fresh install all the way through
calling a complete square dance. By the end you will have picked a
folder, added songs, built a playlist, and played through it with
break timers and everything you need on stage.

<div id="tut-setup"></div>

## 1. Setting up your folder

CallerBuddy keeps all its data — music files, lyrics, and
settings — in a single folder you choose. This can be a local
folder or one inside a cloud drive like OneDrive or Google Drive, so
your collection stays synced across devices.

1. Open CallerBuddy. The **Welcome screen** appears.
2. Click **Choose CallerBuddy folder**.
3. Pick the folder that contains your MP3 (or M4A/WAV) music
   files. If you are starting fresh, create a new empty folder
   and you can import songs later.
4. CallerBuddy scans the folder and opens the
   **Playlist Editor**.

**Tip:** Your files should follow the naming pattern
`LABEL - Title.mp3` (for example
`RYL 607 - Come Sail Away.mp3`). CallerBuddy reads the
label and title from the filename automatically. Lyrics files use
the same base name with an `.html` or `.md` extension.

<div id="tut-playlist"></div>

## 2. Building a playlist

The Playlist Editor shows a song table on the right and your
playlist on the left. There are several ways to add songs:

- **Drag and drop** — drag a song row from
  the table into the playlist panel.
- **Double-click** a song row to add it to the
  end of the playlist.
- **Right-click** a song for a context menu with
  options to add to the start or end, or to play it
  immediately.
- Click the **+** button on a song row.

Once songs are in the playlist, drag them up or down to reorder.
Use the **×** button to remove a song.

You can filter the song table using the text box above it. It
searches title, label, and categories. There is also a rank
filter to show only songs above or below a threshold.

<div id="tut-playing"></div>

## 3. Playing the dance

1. Click **▶ Play** in the playlist panel.
   This opens the **Now Playing** screen.
2. The first unplayed song is automatically selected. Press
   **Enter**, **Space**, or click
   **▶ Play** to start it.
3. **Singing calls** (songs with lyrics) play
   straight through. The lyrics are displayed on the left.
   The progress bar at the bottom is divided into 7 segments
   matching a standard singing-call structure.
4. **Patter** (songs without lyrics) uses looping.
   The left area shows loop controls and a patter timer instead
   of lyrics. The music loops automatically between the loop
   start and end points.
5. When the song ends (or you close the player), you return to
   Now Playing. If the **break timer** is enabled,
   it starts counting down. A gentle chime sounds when time is
   up.
6. The next unplayed song is auto-selected. Repeat until the
   dance is over.

**Tip:** The clock in the upper-right of Now Playing
and the Song Player helps you keep track of the time of day, so
you know when the dance should wrap up.

<div id="howto"></div>

# How-to Guides

Quick recipes for common tasks. Each guide assumes you already
have CallerBuddy set up with a folder.

<div id="howto-import"></div>

## Import songs from a ZIP file

Songs from square-dance music publishers usually come as ZIP
archives containing MP3 files and HTML lyrics.

1. Click the **☰ menu** (upper right)
   and choose **Import Song from ZIP…**
2. Pick the ZIP file from your computer.
3. CallerBuddy opens an **Import Review** tab
   showing its best guess for:
   - The **record label** and **song title**
   - Which **MP3 file** to use (if the ZIP
     contains multiple variants)
   - A **cleaned-up version of the lyrics**
4. Review and adjust anything that looks off. You can pick a
   different MP3, edit the label or title, and modify the
   lyrics in the built-in editor.
5. Click **Import** to finalize. CallerBuddy
   creates the properly named files in your folder and
   refreshes the song library.

<div id="howto-import-folder"></div>

## Import songs from a folder

If your songs were already extracted from a ZIP (or came as loose
files), use the folder import instead.

1. Click **☰ menu** → **Import Song from Folder…**
2. Pick the folder containing the MP3 and HTML files.
3. The same Import Review screen appears. Review and click
   **Import**.

<div id="howto-playlist"></div>

## Build and manage playlists

CallerBuddy has one active playlist at a time. Songs are added
from the Playlist Editor (see the tutorial above for the
basics).

### Quick-play a single song

If you just want to play one song without building a full
playlist, click the **▶** button on its row
in the Playlist Editor, or right-click and choose
**Play now**. This adds the song to the playlist
and immediately opens the player.

### Subfolders

If your CallerBuddy folder has subfolders, they appear as
folder rows at the top of the song table. Click a folder to
open it in a new tab. Both tabs share the same playlist, so
you can add songs from different folders.

### Clear and reset

- **Clear** removes all songs from the playlist.
- In the Now Playing view, **⟲ Reset**
  (Ctrl+R) unchecks all played marks so you can replay
  the entire list.

<div id="howto-pitch-tempo"></div>

## Adjust pitch and tempo

While a song is playing, the right panel shows Volume, Pitch,
and Tempo controls.

- **Volume** (0–100): use the
  <kbd>v</kbd>/<kbd>V</kbd> keys or the arrow buttons to
  adjust in steps of 5.
- **Pitch** (half-steps): use <kbd>p</kbd>/<kbd>P</kbd>.
  Positive values raise the pitch, negative lower it.
- **Tempo** (BPM delta): use <kbd>t</kbd>/<kbd>T</kbd>.
  The effective BPM is shown if CallerBuddy knows the
  original tempo.

Changes are saved to your song library automatically. The
next time you play the song, the same adjustments apply.

<div id="howto-loops"></div>

## Set up loop points for patter

Patter songs (those without lyrics) automatically show loop
controls instead of lyrics when played. Looping lets the music
repeat a section seamlessly so you can call for as long as you
need.

1. Play a patter song. The left panel shows
   **Loop Start** and **Loop End** controls.
2. Listen for a good loop point. Click **Set**
   next to Loop Start (or press **Enter** while
   the Loop Start box is focused) to capture the current
   playback position.
3. Do the same for Loop End.
4. Use the **nudge buttons** to fine-tune:
   - <kbd>←</kbd> / <kbd>→</kbd> nudge by 10 ms
   - <kbd>Ctrl+←</kbd> / <kbd>Ctrl+→</kbd> nudge by 100 ms
5. When Loop End is greater than zero, looping is active.
   The music jumps back to Loop Start when it reaches
   Loop End.

Loop points are saved per song so you only need to set them
once. The progress bar also shows the loop region visually.

<div id="howto-break-timer"></div>

## Use the break timer

The break timer in the Now Playing view counts down between
songs. It helps you keep breaks consistent during a dance.

1. Set the break duration (in minutes) in the
   **Minutes** field. The default is 5 minutes;
   your setting is remembered.
2. Make sure the **Enabled** checkbox is on.
3. When a song finishes, the timer starts automatically.
4. A gentle chime sounds at zero, then repeats every 15
   seconds until you play the next song.
5. Press <kbd>S</kbd> or click **Start/Stop**
   to manually control the timer.

<div id="howto-lyrics"></div>

## Edit or create lyrics

While a singing call is playing, click
**Edit Lyrics** to open the built-in editor. If
the song has no lyrics file yet, the button reads
**Create Lyrics** and generates a template.

- The editor is a rich-text area. Use the toolbar buttons
  to add headings (for figure and section headers) and
  formatting.
- Click **Save** to write changes to disk.
- Click **Exit Editor** to return to the
  read-only lyrics view. If you have unsaved changes,
  you will be prompted to save or discard.

Lyrics are saved as HTML files alongside the MP3, using the
same `LABEL - Title.html` naming convention.

<div id="howto-categories"></div>

## Categories, rank, and filtering

Each song can have **categories** (free-form
tags separated by semicolons, e.g. "Christmas; Patriotic")
and a **rank** (0–100, where 100 is
excellent and 0 means avoid).

### Editing

- In the Playlist Editor, click a cell in the
  **Categories** or **Rank** column
  to edit it inline.
- In the Song Player, the right panel has Categories and
  Rank fields you can edit while a song is playing.

### Filtering

- The text filter above the song table searches across
  title, label, and categories.
- The rank filter lets you show songs with rank
  **≥** or **&lt;** a threshold.
  Leave it empty to disable.

<div id="shortcuts"></div>

# Keyboard Shortcuts

## Global (all views)

| Key | Action |
|-----|--------|
| <kbd>Ctrl+]</kbd> | Next tab |
| <kbd>Ctrl+[</kbd> | Previous tab |
| <kbd>Ctrl+&lt;</kbd> or <kbd>Ctrl+,</kbd> | Go back (tab history) |
| <kbd>Ctrl+&gt;</kbd> or <kbd>Ctrl+.</kbd> | Go forward (tab history) |
| <kbd>Ctrl+W</kbd> | Close current tab |

## Now Playing

| Key | Action |
|-----|--------|
| <kbd>Enter</kbd> / <kbd>Space</kbd> | Play selected song |
| <kbd>Ctrl+R</kbd> | Reset played status for all songs |
| <kbd>S</kbd> | Start/stop break timer |
| <kbd>Esc</kbd> | Close Now Playing tab |

## Song Player

| Key | Action |
|-----|--------|
| <kbd>Space</kbd> | Play / Pause |
| <kbd>←</kbd> | Back 2 seconds |
| <kbd>→</kbd> | Forward 2 seconds |
| <kbd>Ctrl+←</kbd> | Back 5 seconds |
| <kbd>Ctrl+→</kbd> | Forward 5 seconds |
| <kbd>Home</kbd> | Restart song |
| <kbd>End</kbd> / <kbd>Esc</kbd> | Close player, return to playlist |
| <kbd>v</kbd> / <kbd>V</kbd> | Volume down / up (by 5) |
| <kbd>p</kbd> / <kbd>P</kbd> | Pitch down / up (by 1 half-step) |
| <kbd>t</kbd> / <kbd>T</kbd> | Tempo down / up (by 1 BPM) |

## Loop Controls (patter songs, when focused)

| Key | Action |
|-----|--------|
| <kbd>←</kbd> / <kbd>→</kbd> | Nudge ±10 ms |
| <kbd>Ctrl+←</kbd> / <kbd>Ctrl+→</kbd> | Nudge ±100 ms |
| <kbd>Enter</kbd> | Set loop point to current playback position |

<div id="glossary"></div>

# Glossary

<dl>
<dt>CallerBuddy folder (root)</dt>
<dd>The single folder on your computer (or cloud drive) where
CallerBuddy stores and reads all music, lyrics, and app data.</dd>

<dt>Label</dt>
<dd>A short identifier from the music publisher, usually an
abbreviation and catalog number (e.g. "RYL 607" for Royal
Records #607). Part of the filename convention.</dd>

<dt>Patter</dt>
<dd>A type of square-dance segment using background music
(typically with no lyrics). The caller improvises calls
over the music, which usually loops. In CallerBuddy, any
song without an associated lyrics file is treated as patter.</dd>

<dt>Singing call</dt>
<dd>A square-dance segment where the caller sings lyrics set
to the music. The song plays straight through (no loop).
In CallerBuddy, any song with a lyrics file is a singing
call.</dd>

<dt>Playlist</dt>
<dd>An ordered list of songs you plan to play during a dance
session. Built in the Playlist Editor and played from the
Now Playing view.</dd>

<dt>Loop Start / Loop End</dt>
<dd>Timestamps (in seconds) marking where the music should
loop. When Loop End is reached, playback jumps back to
Loop Start. Used primarily for patter songs.</dd>

<dt>Break timer</dt>
<dd>A countdown timer in the Now Playing view that runs
between songs, helping you keep breaks consistent during
a dance.</dd>

<dt>BPM (Beats Per Minute)</dt>
<dd>The tempo of a song. CallerBuddy can auto-detect the
original BPM and lets you adjust it with a delta (positive
to speed up, negative to slow down).</dd>

<dt>Rank</dt>
<dd>A personal preference score from 0 to 100 for each song.
100 means excellent; 50 is average; 0 means avoid. Use rank
filtering to focus on your preferred songs.</dd>

<dt>Categories</dt>
<dd>Free-form tags for a song, separated by semicolons (e.g.
"Christmas; Patriotic; Plus"). Use categories to organize
and filter your collection.</dd>
</dl>
