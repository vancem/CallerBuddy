# Welcome to CallerBuddy {#welcome}

CallerBuddy is a web-based program that Square Dance Callers can use to play
music during performances. 

## CallerBuddy Security {#security}

CallerBuddy is what is known as a **Progressive Web Application** (PWA), which
means that it is running as a web page under the control of a web browser and
is given no more permissions than any other web page is given.  This means
it can't affect things outside the browser unless it asks for permission.
The only permission that CallerBuddy will ask for is to access a single 
folder (the CallerBuddySongs folder), which starts out empty, and CallerBuddy
will fill with music and lyrics and data about CallerBuddy itself (like
the current playlist).  Thus CallerBuddy can only read and write things 
in this folder (and sub-folders), and thus is very safe to run.  

You will see this security in action when you first start up CallerBuddy. 
The dialog box that is used to pick this folder is NOT from CallerBuddy, it
is from the browser responding to CallerBuddy's request (Don't blame 
CallerBuddy for its user interface).  Once you have selected a folder 
the browser then brings up another popup to make you confirm that you are
OK granting CallerBuddy the permission to read and write to this folder.
This can feel inconvenient, but it is what allows you to run CallerBuddy
without fear of it being malicious software.  

## Running CallerBuddy Outside the Browser

CallerBuddy is what is known as a **Progressive Web Application** (PWA).  This
is a fancy name for support for the fact that web browsers are powerful enough
that you can  write what looks and feels like a normal computer application as
an a web page running in the browser.  The most important property of a PWA is
that **it has the security model of a web page**.  A user surfing the web does
not TRUST the web sites he is visiting and so web pages are placed in a
'sandbox'which restricts the page from doing dangerous things (like touching
arbitrary files).   PWA's inherit this security model.   On the plus side it
means that running and installing a PWA like CallerBuddy is not 'dangerous' (it
is highly restricted in what it can do), but on the minus side it is highly
restricted in the files that it can read or write.   Luckily CallerBuddy's main
functionality is to play music and keep track of the music in its own folder set
up for that purpose, which is (barely) within the scope of what a PWA can do.

At is heart, a PWA like CallerBuddy is just a web page and like all web pages it
has a name (URL).  CallerBuddy's is
[https://vancem.github.io/CallerBuddy](https://vancem.github.io/CallerBuddy).
When you open this web page, notice that on desktop platforms there is a icon on
the right side of the textbox for the web page name (URL). Here it is in the
Microsoft Edge browser: 

![alt text](images/CallerBuddyEdge.png)

On the Chrome browser the icon looks different (a screen with a down arrow)
but it is in the same spot and works the same.   If you click this install
button the browser will ask you a question or two about how to install it (the
defaults are fine). CallerBuddy can then be launch like any other application
(and you can pin it to the task bar if you like). 

On an Android phone the process is very similar but the phone doesn't have the
install icon, so you press the vertical ellipses '⋮' and select the 'Install and
create shortcut' menu item (you may need to scroll) to get at the install functionality.  

### What Installing Does

Installing CallerBuddy as an app does two things. 
   1. It removes the browser box around the CallerBuddy window and browsers
   URL textbox freeing up some room (which is nice).
   2. Makes it easier to launch (It is in the start menu, and you can put it
   on the taskbar).

Note that installing CallerBuddy does not give CallerBuddy any more permission 
than it had when it was run inside the browser.  Also uninstalling CallerBuddy
does **not** touch the CallerBuddySongs folder, so you can freely uninstall
CallerBuddy (like any other app on Windows go to Add and Remove Programs) without
any worry about deleting your songs.  

## Where you can use CallerBuddy

1. Can run in your browser or as a desktop launched application.   The app
is tiny can downloads in seconds.  
2. It is cloud storage friendly, meaning you can have your songs 'in the cloud'
where they are backed up, and accessible from multiple machines yet kept in
sync (you logically only have one collection of songs).
3. While very network cloud friendly, CallerBuddy can run completely 'offline' 
so it works fine in venues without any network connectivity.  
4. Works on a wide variety of platforms.  It works on Windows, 
Macs (with Chrome Browser), Chromebooks, Linux, and Android phones (sadly 
IPhone browsers do not support needed functionality, and are unsupported)
5. CallerBuddy works well on Android phones, using just touch and allowing both
landscape and portrait orientations.   Your phone can definitely be your 
primary performance tool.

## What CallerBuddy can do for you

  1

```
You can immediately play songs, but it encourages you to generate
a list of songs (a playlist) that you will perform at a dance and have them ready to go to perron in seauence.  
```

1. You can modify the pitch and tempo and volume of a song and these

preference are remembers so the song is always ready to sing 

# Your First Dance {#first-dance}

This walkthrough takes you from a fresh install all the way through
calling a complete square dance. By the end you will have picked a
folder, added songs, built a playlist, and played through it with
break timers and everything you need on stage.

## 1. Setting up your folder {#tut-setup}

CallerBuddy keeps all its data — music files, lyrics, and
settings — in a single folder you choose. This can be a local
folder or one inside a cloud drive like OneDrive or Google Drive, so
your collection stays synced across devices.

1. Open CallerBuddy. The **Welcome screen** appears.
2. New users: click **Instructions to Create CallerBuddySongs**
  for a step-by-step walkthrough (with screenshots) of creating
   an empty **CallerBuddySongs** folder using the browser's folder
   picker, then click **Open CallerBuddySongs** from inside those
   instructions. Returning users: click **Open CallerBuddySongs**
   directly and pick your existing folder.
3. If the folder is empty, CallerBuddy offers optional free demo
  songs so you can try the app immediately. You can also import
   your own music later.
4. CallerBuddy scans the folder and opens the
  **Playlist Editor**.

**Tip:** Your files should follow the naming pattern
`LABEL - Title.mp3` (for example
`RYL 607 - Come Sail Away.mp3`). CallerBuddy reads the
label and title from the filename automatically. Lyrics files use
the same base name with a `.md` extension.

## 2. Building a playlist {#tut-playlist}

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

## 3. Playing the dance {#tut-playing}

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

# How-to Guides {#howto}

Quick recipes for common tasks. Each guide assumes you already
have CallerBuddy set up with a folder.

## Import songs from a ZIP file {#howto-import}

Songs from square-dance music publishers usually come as ZIP
archives containing MP3 files and HTML or Markdown lyrics.

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



## Import songs from a folder {#howto-import-folder}

If your songs were already extracted from a ZIP (or came as loose
files), use the folder import instead.

1. Click **☰ menu** → **Import Song from Folder…**
2. Pick the folder containing the MP3 and HTML files.
3. The same Import Review screen appears. Review and click
  **Import**.



## Build and manage playlists {#howto-playlist}

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



## Adjust pitch and tempo {#howto-pitch-tempo}

While a song is playing, the right panel shows Volume, Pitch,
and Tempo controls.

- **Volume** (0–100): use the
v/V keys or the arrow buttons to
adjust in steps of 5.
- **Pitch** (half-steps): use p/P.
Positive values raise the pitch, negative lower it.
- **Tempo** (BPM delta): use t/T.
The effective BPM is shown if CallerBuddy knows the
original tempo.

Changes are saved to your song library automatically. The
next time you play the song, the same adjustments apply.

## Set up loop points for patter {#howto-loops}

Patter songs (those without lyrics) automatically show loop
controls instead of lyrics when played. Patter always loops: by
default the whole file repeats (slightly before the very end for
a clean jump). Looping lets the music repeat a shorter section
seamlessly instead, so you can call for as long as you need.

1. Play a patter song. The left panel shows
  **Loop Start** and **Loop End** controls.
2. Listen for a good loop point. Click **Set**
  next to Loop Start (or press **Enter** while
   the Loop Start box is focused) to capture the current
   playback position.
3. Do the same for Loop End.
4. Use the **nudge buttons** to fine-tune:
  - ← / → nudge by 10 ms
  - Ctrl+← / Ctrl+→ nudge by 100 ms
5. When Loop End is greater than zero, looping is active.
  The music jumps back to Loop Start when it reaches
   Loop End.

Loop points are saved per song so you only need to set them
once. The progress bar also shows the loop region visually.

## Use the patter timer {#howto-patter-timer}

While playing a patter song, the left panel (below the loop
controls) also shows a patter timer that counts down while the
music plays.

1. Set the **Duration (min)** field to how long you
  want to call for.
2. Make sure the **Enabled** checkbox is on (or press
  Ctrl+T) if you want a chime.
3. When the countdown reaches zero, a chime sounds and repeats
  while overtime; the counter keeps going into negative (shown
   in red) either way, so you can see how far over time you are.

Your duration setting is saved and reused next time.

## Use the break timer {#howto-break-timer}

The break timer in the Now Playing view counts down between
songs. It helps you keep breaks consistent during a dance.

1. Set the break duration (in minutes) in the
  **Minutes** field. The default is 5 minutes;
   your setting is remembered.
2. Make sure the **Enabled** checkbox is on.
3. When a song finishes, the timer starts automatically.
4. A gentle chime sounds at zero, then repeats every 15
  seconds until you play the next song.
5. Press S or click **Start/Stop**
  to manually control the timer.



## Edit or create lyrics {#howto-lyrics}

While a singing call is playing, click
**Edit Lyrics** to open the built-in editor. If
the song has no lyrics file yet, the button reads
**Create Lyrics** and generates a template.

- The editor opens in **Formatted** mode: edit lyrics as they
look during playback (bold, headings, info text).
- Use the toolbar (**B**, **Heading**, **Info**, **P**) or
Ctrl+B / H / I / P.
- Click **Edit Markdown** to edit the source directly; click
**Edit Formatted** to return. **Markdown help** is available
in Markdown mode.
- Click **Save** to write changes to disk.
- Click **Exit** to return to the read-only lyrics view.
If you have unsaved changes, you will be prompted to save
or discard.

Lyrics are saved as Markdown files alongside the MP3, using the
same `LABEL - Title.md` naming convention.

## Lyrics Markdown {#howto-lyrics-markdown}

CallerBuddy lyrics use a small Markdown subset:


| Write this                 | What you get              |
| -------------------------- | ------------------------- |
| `# Title`                  | Song title (large)        |
| `## Figure`                | Section heading (red)     |
| `_authorship_` or `*note*` | Info text (blue, smaller) |
| `**call name**`            | Bold                      |
| `\` at end of a line       | Force a line break        |
| blank line                 | New paragraph             |


Example:

```markdown
# One Call Away
_(NB 412)_

## Opener
**Sides** face **grand square**\
I'm only one call away\
```

When you import a ZIP or folder that contains HTML lyrics,
CallerBuddy converts them to this Markdown format automatically.

## Categories, rank, and filtering {#howto-categories}

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
**≥** or **<** a threshold.
Leave it empty to disable.



# Page Overviews {#pages}

Each main screen has a **?** button of its own (top
of the Playlist pane, or top-right of the Song Player) that jumps
straight here for a full overview of that screen.

## Playlist Editor {#page-playlist-editor}

The Playlist Editor is where you browse a folder of songs and
build the playlist you'll perform. The left pane is your
**Playlist**; the right pane is the **song table** for the
current folder.

- Add songs by dragging a row into the playlist, double-clicking
a row, right-clicking for a menu, or clicking the row's
**+** button.
- Reorder the playlist by dragging items; remove one with its
**×** button.
- The song table can be filtered by text (title, label,
categories) and by rank, and sorted by clicking any column
header. Click a **Categories** or **Rank** cell to edit it
inline.
- Subfolders appear as rows — click one to open it in its own
tab (it shares the same playlist).
- **Play** opens Now Playing; **Clear**/**Restore** manage the
whole playlist; non-root folder tabs also have **Close**.
- Shortcuts: Ctrl+F focus the filter,
Ctrl+R focus the rank filter,
+/= add the selected row,
P play it now, ↑/↓ change the
selected row, Enter play the playlist.

See "Building a playlist" and "Categories, rank, and filtering"
above for more detail.

## Now Playing {#page-now-playing}

Now Playing shows the playlist queue you'll work through during
the dance, with a break timer and clock alongside it.

- Click a song to select it (or use ↑/↓),
then **Play** (or double-click) to open the Song Player.
- Each song has a played checkbox; toggle it with
M. **⟲ Reset** clears all of them so you can
replay the whole list.
- Delete removes the selected song from the playlist.
- The **break timer** counts down between songs — see
"Use the break timer" above for details.



## Song Player {#page-song-player}

The Song Player plays one song at a time, with a **?** button in
the top-right corner of the left pane that opens this overview.

- **Singing calls** show scrolling lyrics on the left; the right
panel has transport, Volume/Pitch/Tempo, and Categories/Rank.
- **Patter** songs show loop controls and a patter timer on the
left instead of lyrics.
- See "Adjust pitch and tempo", "Set up loop points for patter",
"Use the patter timer", and "Edit or create lyrics" above for
details on each control.



# Keyboard Shortcuts {#shortcuts}



## Global (all views)


| Key              | Action                   |
| ---------------- | ------------------------ |
| Ctrl+]           | Next tab                 |
| Ctrl+[           | Previous tab             |
| Ctrl+< or Ctrl+, | Go back (tab history)    |
| Ctrl+> or Ctrl+. | Go forward (tab history) |
| Ctrl+W           | Close current tab        |




## Now Playing


| Key           | Action                            |
| ------------- | --------------------------------- |
| Enter / Space | Play selected song                |
| Ctrl+R        | Reset played status for all songs |
| S             | Start/stop break timer            |
| Esc           | Close Now Playing tab             |




## Song Player


| Key       | Action                                                                  |
| --------- | ----------------------------------------------------------------------- |
| Space     | Play / Pause                                                            |
| ←         | Back 2 seconds                                                          |
| →         | Forward 2 seconds                                                       |
| Ctrl+←    | Back 5 seconds                                                          |
| Ctrl+→    | Forward 5 seconds                                                       |
| Home      | Restart song                                                            |
| End / Esc | Close player, return to playlist                                        |
| v / V     | Volume down / up (by 5)                                                 |
| p / P     | Pitch down / up (by 1 half-step)                                        |
| t / T     | Tempo down / up (by 1 BPM)                                              |
| Alt++     | Lyrics text larger (~10%; plus / = key, not Ctrl — avoids browser zoom) |
| Alt+−     | Lyrics text smaller                                                     |




## Loop Controls (patter songs, when focused)


| Key             | Action                                      |
| --------------- | ------------------------------------------- |
| ← / →           | Nudge ±10 ms                                |
| Ctrl+← / Ctrl+→ | Nudge ±100 ms                               |
| Enter           | Set loop point to current playback position |




# Glossary {#glossary}

CallerBuddy folder (root)

The single folder on your computer (or cloud drive) where CallerBuddy stores and reads all music, lyrics, and app data.

Label

A short identifier from the music publisher, usually an abbreviation and catalog number (e.g. "RYL 607" for Royal Records #607). Part of the filename convention.

Patter

A type of square-dance segment using background music (typically with no lyrics). The caller improvises calls over the music, which usually loops. In CallerBuddy, any song without an associated lyrics file is treated as patter.

Singing call

A square-dance segment where the caller sings lyrics set to the music. The song plays straight through (no loop). In CallerBuddy, any song with a lyrics file is a singing call.

Playlist

An ordered list of songs you plan to play during a dance session. Built in the Playlist Editor and played from the Now Playing view.

Loop Start / Loop End

Timestamps (in seconds) marking where the music should loop. When Loop End is reached, playback jumps back to Loop Start. Used primarily for patter songs.

Break timer

A countdown timer in the Now Playing view that runs between songs, helping you keep breaks consistent during a dance.

BPM (Beats Per Minute)

The tempo of a song. CallerBuddy can auto-detect the original BPM and lets you adjust it with a delta (positive to speed up, negative to slow down).

Rank

A personal preference score from 0 to 100 for each song. 100 means excellent; 50 is average; 0 means avoid. Use rank filtering to focus on your preferred songs.

Categories

Free-form tags for a song, separated by semicolons (e.g. "Christmas; Patriotic; Plus"). Use categories to organize and filter your collection.