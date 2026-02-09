# CallerBuddy Specification

## Overview

CallerBuddy is a tool for square dance callers to manage a collection of music
(MP3 files) and Lyrics (HTML or MD files) so they can select songs for a dance,
then play songs and read the associated lyrics during the dance. It is loosely
based on the [SqView](https://www.SqView.se/download.php) program, the general
purpose is the same, but most of the UI details are different.

---

## Requirements

This app is designed to fix many of the limitations of SqView. In particular it
needs to be cross platform. This is the prioritized list of platforms

1. Windows 11
2. MacOS
3. Chromebook
4. Android Phone
5. IPhone

The two phone platforms are not as important, and iPhone is the least important.
A minimum viable product would support Windows and macOS.

The user is likely to wish to store the music and lyrics in some cloud service
(OneDrive, Google Drive, ICloud) so it is available from more than one device
(and is backed up). Thus CallerBuddy should support that. iCloud is not as
important as the other two.

The app is likely to be used where network connectivity might be poor. Thus it
needs to be possible to ensure that all the data needed for one dance can be
cached locally while there is connectivity. However the user model is that the
files live in the original locations, and the program ensures that the cache
copy is there when needed and up to date.

## 2. Core Architecture

The preferred way of achieving the cross platform requirements is to make a PWA
(Progressive Web App). This is basically a web page along with just enough
support to allow it to act like native app. However PWA's have many restrictions
inherited by the fact that it runs in the browser.

In particular, accessing arbitrary files from PWA is not possible, however it is
possible to ask the user to provide a folder, and the handle that is passed back
to the PWA has access to that folder (and sub-folders), and importantly, this
handle can be cached across invocations of the app. Thus we can ask the user to
provide the folder where the music lives, and never have to ask again. We also
know that the PWA has access to local storage (OPFS), that can be used to cache
things locally for offline capabilities, however this storage will only be used
for caching, from the user's point of view its use is invisible.

From the user's point of view we expect all the data the user cares about will
be a folder (or subfolder) of what we will call the CallerBuddyRoot. This is the
folder that the user provides the app to initialize it. All music (MP3 files)
and lyrics (HTML or MD files) will be in this folder. In addition the app will
put any persistent state it needs in this location.

In addition to the original song (MP3) file and the possible lyric file (HTML or
MD), the app will have some general settings that will be put in a settings.json
file and a small table of data associated with each song in a songs.json file.
It is possible that these files are in the cloud and are being accessed
simultaneously from two different devices. This is not a important scenario, so
it is enough that the updates are atomic. If updates are lost (atomically) that
is acceptable. If it is easy to keep the window where updates might be lost
small, that should be done, but it is not critical as the scenario is unlikely.

At a high level, the app is given a folder (possibly in the cloud), and it plays
songs and reads and writes information from this folder, as well as plays music
to the default sound device and displays lyrics in a viewer.

In addition to just playing the music, it may be necessary to adjust the pitch
and tempo of the music to fit the caller. Thus signal processing may need to be
done. However this adjustment is relatively rare (the user finds a pitch and
tempo that he likes and leaves it). Caching will work extremely well for this.

## Workflows

### Initialization Workflow

- This will be the first UI that the user sees on first launch after install.
- Need to welcome the user, explain that we need a folder to put CallerBuddy
  data into and to fetch songs from. This UI is where we get this folder from
  the user (there is button that brings up the browser's folder picker).

### The Playlist Workflow

There is a concept of a _playlist_. A _playlist_ is simply a list of songs will
be played sequentially during a dance. The caller is likely to want to create
this list before the dance.

A _song_ conceptually includes the music (MP3) file, and the lyric file (HTML or
MD), but also includes

- The _title_ of the song
- The _label_ of the song. The _Label_ is a short name and number that
  identifies the song by its recording company and a number that the recording
  company assigned it. For example the song "Come Sail Away" has the label "RYL
  607" where "RYL" is an abbreviation for 'Royal Records" (a recording company)
  and 607 is the number Royal Records assigned to this song. This can be useful
  because recording companies often have a style, so looking things up by
  recording company can be useful.
- The _category_ of the song. This is a user defined string meant to represent a
  useful group (like Christmas, or Patriotic)
- The _rank_ of the song. This is a decimal number (lower is better), that
  represents how much the user prefers this song.
- The _date_ of the song. This is timestamp for when the song was first seen by
  CallerBuddy (note the age of the file) It is useful for callers to find songs
  he recently added to his collection (so he can practice/use them)
- The _lastUsed_ date of the song. This is the last time the song was played by
  CallerBuddy. This is useful to find songs the caller has not used (and should
  get back into his rotation)
- The _loopStartTime_. This is the time in seconds from the beginning of the
  song where looping will jump to.
- The _loopEndTime_. This is the time in seconds from the beginning of the song
  where will jump back to the _loopStartTime_
- The _volume_. A number from 0-100 representing the volume to be played.
- The _pitch_. A signed small integer which represents how many half-steps (1/12
  of an octave) that the pitch of the music should be altered from the original
  music
- The _originalTempo_. A decimal number representing the number of beats per
  minute that the music has. Ideally CallerBuddy can look at the MP3 file and
  determine this, but if necessary the user can provide it.
- The _deltaTempo_. A signed decimal number (in BPM) that CallerBuddy should
  adjust the music's tempo by

This data will be serialized to a songs.json file when and data associated with
a song is modified by CallerBuddy.

The loopStartTime and loopEndTime control song looping. If loopEndTIme is
nonzero after playing that many seconds of audio the song will skip to the
loopStartTime and continue from there. This allows the music to play forever.
Well chosen times will make the transition unnoticeable. Ideally CallerBuddy
would choose good default for this, but the user can override them.

The file names for music an lyrics files follow the convention of LABEL - TITLE.
Thus the song "Come Sail Away" with the label "RYL 607" is stored in a file
called

    "RYL 607 - Come Sail Away.MP3"

and its lyrics could be stored in the file

    "RYL 607 - Come Sail Away.HTML"

Thus we know the _label_ and the _title_ just by having the MP3 file. If there
is an associated HTML or MD file then we also know the lyrics. All the other
fields have reasonable defaults. Thus CallerBuddy only needs the MP3 files to
bootstrap a song database.

Thus once the app has a CallerBuddyRoot directory, it can look for a songs.json,
and generate one if needed (by scanning for MP3 files). These files can be
displayed int what feels like a row and column table (spreadsheet) with
filtering and the user can select songs to be included in the list.

Once the user has created the playlist he can move on to the 'playingPlaylist'
UI which shows the finished playlist, and keeps track of what has been played so
far. One of the options is to play the next song, which takes the user to the
playingSong UI for that song.

The playingSong UI displays the lyrics (if available) and has controls for

- modifying the song (changing pitch tempo and volume)
- Controlling the playing of the song (play button, stop, forward 2 sec, forward
  5 seconds, back 2 seconds, back 5 seconds, restart from the beginning)
- A slider that shows the progress of the song and allows the user to select an
  arbitrary spot in the song
- information like the time position in min:sec in the music, and the elapsed
  time since reset, as well as a clock that displays the time of day. It should
  also show the total elapsed time since the song first played. It also shows
  the looping start and end (and the fact that they are set). Because singing
  calls have 7 equal sections, the slider should be visually divided into 7
  sections so the caller can tell at a glance what section is currently being
  played. The slider should also show the loop start and end (if set)

When the song finishes, or the user closes the playingSong UI, the app goes back
to the 'playingPlaylist' UI. Normally square dances consist of a patter portion
(4-10 min with looped music and no lyrics) and a singing call (~4 min) playing a
song end-to-end (no loop) with lyrics, followed by a break of typically 5
minutes when nothing is played. The playingPlaylist UI should support this
pattern while being very flexible (sometimes the patter is skipped, or two
singing calls are performed, or it is just one singing call and nothing else, it
needs to be flexible). The app identifies patter because it has no lyrics (that
is the definition from the app's point of view). This UI should allow a 0-10 min
timer to be set for the break time as well as a timer for patter length
(typically 3-10 min). In both cases when the timer goes off, a sound is played
(the the user gets to select). The UI has controls for these timers (stop,
start, current countdown), as well as what break or song we are on in the
sequence. The user can cancel out of this UI, which clears the playlist in
preparation for creating a new one.

### Single song Workflow

During formal dances, creating a playlist and following it is the likely
workflow. However there are many informal settings where you just need
CallerBuddy to play a song. Thus it needs to be possible to pick a song, and
immediately play it, and when that is done go back to the list of songs and
select another and play that. This needs to be hassle free. It can go through
the playlist workflow but that workflow should not 'get in the way' (one action
will get them playing a song). This should just fall out of the playlist
workflow with a suitable shortcut action, but we can't lose sight of this
requirement.

## User Interface (UI) Design.

### General UI principles

CallerBuddy will be run both on laptops, and phones, which have pretty different
UI constraints. The CallerBuddy UI will be optimized for the laptop first, but
it should work on a phone UI as well as it can given its constraints.

As always, best practices in UI design should be applied. In particular, clutter
should be kept to a minimum. It is okay to use words (and not make everything
icons), as our audience is English speaking (however we should allow for
globalization, but it is not a priority for the first version). Features need to
be discoverable, and tooltips should be used aggressively. The UI is likely to
be used on stage, which means mouse/touch is inconvenient so the UI should be
useful using just the keyboard (on the laptop), and the keyboard shortcuts
should be in the toolTips.

For inspiration for the UI, CallerBuddy should look toward either VSCode or the
Chrome browser. Where possible, actions should be possible via gestures
(dragging songs into the list, or changing song order by dragging the songs
around). Like VSCode, context menus (e.g. right click) should be preferred, and
menus should show the keyboard shortcuts so that the user can learn them while
using the app.

### Basic UI layout

The basic UI layout will be much like the Chrome Browser. The idea is that there
will be a bunch of tabs where real work happens. As the workflow proceeds, it
opens new tabs, but the old ones may stay around so you can navigate back to
that tab by clicking it (just like the Chrome browser). Like the browser, there
also needs to be a small UI element (e.g. upper right corner) that controls
things that are global to all workflows (like reopening the welcome window to
set the CallerBuddyRoot folder, or to bring up classic help docs, app-wide user
preferences, or app version information and upgrades)

#### Welcome Screen UI

When the CallerBuddyRoot is unknown, or by user request (e.g. from the menu item
in the global control), a welcomeScreen tab will be created. If one already
exists, that tab will be activated (thus only one in the app). It will have a
small amount of text describing CallerBuddy, and how it works, it will have a
button to open the CallerBuddyRoot folder, and it will have a button that will
bring up the more detailed help for CallerBuddy (which will be a tab displaying
an HTML document containing a traditional long form help document). If the
CallerBuddyRoot is already known this screen is skipped and a playlistEditor is
brought up

#### Playlist Editor UI

Conceptually there is only one playlist in the app, but there can be many
editors that operate on that playlist. From a UI standpoint a playlist editor is
similar to an OS File Explorer UI, and so the UI details should mimic that UI.
It shows a list of things on the right side (which for us are songs). It will
have some text box at the top that allows those songs to be filtered. The songs
will be in a table grid with column headings (like a File Explorer), and you
should be able to filter on the columns (like how Google Sheets work). What is
different from a File Explorer UI is that the goal is to create the playlist,
which is a list of song titles on the left. You can select a song on the right
and right click to add it to the beginning or end of the list, and you can drag
the selected line to the list and place it where you want in the order. You can
also grab items that are in the list and drag them to new places in the list.

A playlist editor has an OS folder associated with it which is where it gets its
songs from. WHen the CallerBuddyRoot is set, CallerBuddy will open a playlist
editor pointing a the CallerBuddyRoot.

Like the file explorer, in addition to songs in the right list, there can be
folders. These correspond to folders in the playlist editor's folder. You can
open these folders and change the playlist's folder to the folder the user
indicated. There should be a .. folder in the list (assuming you can go to the
parent folder, depending on how the folder APIs work the playlist may need to
keep track of its parent, and only show the .. folder when it is possible to do
so) You can also right click on the folder and open a new tab (playlist editor)
with the new folder to the right of the current playlist editor but in the same
tab (thus you can have two editors open at the same time). The two editors are
able to close independently of one another. Thus they each probably have a title
bar (which is the name of the folder they represent, and an X icon to close
each). They will both be operating on the same playlist (there is only one per
app). Playlist editors don't close automatically they need to be closed by the
user (the x on the tab or title bar).

There should be a button near (above) the playlist that indicates 'play'
(probably a triangle to the right) clicking that will bring you to the
playListPlay UI.

#### PlaylistPlay UI

The playlistPlay UI shows the list of song titles on the left (roughly the same
position as in the playlist editor). Played songs will be grayed out (but not
removed). There is a cursor (probably a triangle pointing left) on the right of
the list that shows where the first non-grayed song is (the next song to be
played) There is a selected song, which is the next song to play, however the
user can override this by clicking on any song, and that will cause it to be the
next song to be played. By default however, the next song (the one the cursor
points at) is the first non-grayed song in the list.

There is a play button (probably a triangle pointing right). That will play the
currently selected song. When the song is done it will be grayed out. There is a
break timer on the right of this tab. It contains a textbox for the time of the
break (default 5 min, user can set, and it is persisted in the settings.json
file), and a countdown display, and a button that turns the break timer on. WHen
a song completes IF the break timer is on, it starts counting down, when it hits
zero it will play a sound (we want a non-obtrusive sound) It should replay every
20 seconds from then on until either the play UI is dismissed, or a new song is
played (in which case it waits until the song finishes and starts the countdown
from the top again) Turning the timer off, grays out the break timer UI
components and it does nothing.

The playlistPlay UI has a clock showing the time of day.

Logically there is only one PlaylistPlay tab in the app. If the tab already
exists it is reused, otherwise it is created. Like all tabs, it can be closed.

When a song is played, it closes any existing song that was being played. Thus
there is at most one playSong UI as well. The playlistPlay UI should become
inactive (grayed) when the playSong UI is active (only one song playing at a
time)

#### playSong UI

When the play button in the playlistPlay UI is activated, it brings up a new tab
that plays a single song. This tab is dominated by a window on the left that
displays the lyrics (if present). Along the bottom of the UI is a slider that
represents the whole runtime of the song broken into 7 segments (alternate
colors to highlight the segments). You can use the slider to move to any point
in the song. On the right side are controls and information. There are the
standard song playing buttons (play, stop, forward a bit (2 sec), forward more
(5 sec) backward a bit (2 sec), backward more (5 sec), and restart). In addition
there are controls for displaying the volume, pitch and tempo. Around each value
there are buttons on the left and right (triangles pointing left and right) that
allow you to adjust the values up or down. There are also displays for min:sec
into the song, min:sec for the total song playtime (which may be different
because of looping or seeking in the slider). There is also a clock showing the
time of day.

If the song has no lyrics it is assumed to be a patter call and the looping
feature becomes active. All of this UI can be placed where the lyrics normally
go since they don't exist for patter. It can display the loop start and end (and
gray them out if inactive (loopEnd == 0)). The UI lets these values be modified,
there are also 'nudge' (10msec) and 'big nudge (100 msec) buttons that move the
value in each direction. The loop start and end points are also shown on the
bottom slider, and can be set from there by moving the mark for each of these on
the slider. The start and end loop values are shown with 2 digits after the
decimal point so that users see the changes from nudges. Patter also has a
'patterTime' countdown timer. There will be UI to set the amount of time
((default 5 min, user can set, and it is persisted in the settings.json file)),
and a live countdown of how long the music has been running. When the countdown
reaches zero a sound is played (again unobtrusive) once (unlike the break timer
it will not chime again). The countdown continues past zero into negative
numbers (color changes to red) so that the user knows how much over budget they
are.

When the song finishes playing the tab will auto-close, and the playListPlay UI
is activated again.

## Constraints

It is assumed that the CallerBuddyRoot may be on a cloud device, but a playlist
might be used somewhere were network connectivity may be poor or unavailable.
Because of this CallerBuddy needs to have good offline capabilities. In
particular it will need some on-device caching (probably OPFS). CallerBuddy
needs to test for network connectivity at least at startup, and ideally any time
data is being fetched from CallerBuddyRoot, and if that fails, fall back to the
local copy. (Thus Settings.json and songs.json need to have local copies). It
also need to remember if it is out of sync with the true CallerBuddyRoot, and
have background pinging of the network (exponential backoff to a maximum of 2
min) and flush any changes when connectivity is restored.

When playlists are created, CallerBuddy should aggressively ensure that the
music and lyric files are copies to the local cache (so they are available
offline). Very quickly the songs are likely to be in the local cache so this
will not be expensive. It should also aggressively cache the result of changing
the pitch or tempo so no expensive operations are done when the song is being
played. Song collections can be very large so caching all songs locally is
probably too much, but anything that makes it into a playlist (even before the
playlist is played), should be cached. Songs can be removed from the cache if
they have not been used for over a week (say 10 days).
