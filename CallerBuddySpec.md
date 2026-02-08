# CallerBuddy Specification

## Overview

CallerBuddy is a tool for square dance callers to manage a collection of music
(MP3 files) and Lyrics (HTML or MD files) so they can select songs for a dance,
then play songs and read the associated lyrics during the dance. It is loosely
based on the [sqview](https://www.sqview.se/download.php) program, the general
purpose is the same, but most of the UI details are different.

---

## Requirements

This app is designed to fix many of the limitation sqview. In particular it
needs to be cross platform. This is the prioritized list of platforms

1. Windows 11
2. MacOS
3. Chromebook
4. Android Phone
5. IPhone

The two phone platforms are not as important and IPhone is the least important.
A minimum viable product would support Windows and MacOS.

The user is likely to wish to store the music and lyrics in some cloud service
(OneDrive, Google Drive, ICloud) so it is available from more than one device
(and is backed up). Thus CallerBuddy should support that. ICloud is not as
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

The User interface is pretty simple and should not require a heavy UI framework.
A VERY light package like [lit](https://lit.dev/) is acceptable if it ads clear
value to justify its size and conceptual weight.

## General Coding Principles

The overarching goal is to create a code base for this application that
demonstrates all the best software engineering practices (as preached by
[Modern Software Engineering](https://www.youtube.com/@ModernSoftwareEngineeringYT)).
This includes

- When in doubt, FIX THE SPEC (ASK). This specification is meant is meant to
  include enough information that a diligent developer could write the app and I
  as the specifier would not be 'surprised' by the result. Small details are
  left to the developer, but if there big ambiguities in the user experience, or
  in the architecture, or problems during development that require non-trivial
  rewrites, then these things should be surface as questions about the
  specification. Do not simply make a choice and continue coding. Obviously a
  balance is required, but when in doubt is is OK to ask, at the very least we
  will converge to answer of what needs to be escalated to fixing the spec, and
  what is an implementation detail. Github issues (with high priority) can be
  used to track the need for clarification or spec change.
- DOCUMENT the important design decisions as code design happens, along with
  tradeoffs, and ramifications. Here is where you provide API interface (what
  looks like a class definitions without the bodies), but with good, descriptive
  names and enough comments to describe the purpose of the class. This needs to
  be done for major data (like songs, probably the cache manager, song player
  ...). If the interface is functional, mention that. Glue code (especially API
  glue code) does not need this design treatment. I don't expect more than 10
  such classes that deserve up-front design. Save these explicitly, and keep
  them up to date as the code base is modified and prioritize these files in
  your AI CONTEXT when working with the code.
- A analogous design document should be made UI design. Describe how any UI
  frameworks will be used and how they add value, If there is UI state that is
  not part of the model, that is interesting, describe how UI interactions
  (clicks) get mapped back to items in the (non-ui) model including how UI items
  get access to the model to begin with. The fewer global variables you have the
  better (having classes for the whole app means you probably don't need any
  global variable). Like the design document, this document should cover the
  broad way that the UI interacts with the model, and any additional state the
  UI needs for its own use. But it should be reasonably terse, and it should be
  anchored by UI elements that make up the user interface. Styling is definitely
  not in this document, nor are most 'boring' UI items like buttons an
  textboxes. I only expect a handful (< 10) of UI elements that need this
  treatment (e.g. playListEditor).
- Generally speaking if something is complex (e.g. over 200 lines of code and 10
  functions), it should have been covered by one of the above design documents
  somewhere. If that is not the case either add mention to one of them and work
  through any design issue.
- The design documents should work though any non-trivial lifetime issues. There
  should be an CodingBuddy class that represents the program as a whole, that
  gets created at start and dies when the program is closed. All global
  variables need to be justified, and no objects should 'leak' in the sense that
  the have outlived their usefulness (or will accumulate if the program runs a
  long time). Lifetime issues (e.g. potential leaks) need an explicit GitHub
  issue tracking the problem.
- Code design should include strong factoring into components that are only
  weakly coupled, and can be understood and tested independently of each other.
- Typed programming is to be preferred (typescript whenever possible over raw
  javascript).
- Functional programming style should be used when it can be done naturally, but
  use stateful object oriented where it leads to a clean design. If the
  functional design requires unnatural return parameters or extra parameters
  that don't feel relevant, than a stateful object oriented design is better.
  Generally smaller and simpler things where the state is easy to describe tend
  to benefit from functional design. Bigger things that managed diverse
  collections of state should be object based.
- Reuse: If there are GOOD QUALITY components (e.g. sound processing software)
  that exist on the web, or useful UI components they should be preferred IF
  THEY ADD ENOUGH VALUE (the work well, were well designed, and do not add large
  unnecessary bloat, and the alternative is a lot of locally written code) If
  there is any doubt, create a GitHub issue for it asking for a fix to the
  relevant design document.
- Code that is easy to understand and maintain. Simplicity and
  straightforwardness should be the theme. Names should be descriptive, and
  comments placed where they add value (typically expressing intent, or
  non-local behavior, something the code will not tell you easily)
- Shorter code is generally better code (avoid redundancy and build meaningful
  abstractions) but being easy to understand trumps this. Subtle code (even if
  it is short) is a red flag.
- Strong design for testability, including sufficient testing (code coverage is
  a MINIMUM), Assertions of preconditions and post-conditions and any data
  structure invariants that is not trivially (locally) known (these also make
  the code readable). When total test time is over 1 minute, an audit should be
  done to comment out assertions that impact performance and are likely to have
  low value (e.g. they have not tripped in a long time)
- The goal is to spend very little time debugging. If asserts are not enough to
  easily diagnose a problem, then logging should be standard during test runs so
  that sufficient information is available to diagnose problems.
- Code should follow consistent rules on formatting and style following language
  standards and best practices. Code should follow 'standard idioms' if they
  exist, and in general be 'boring' (doing things in the most straightforward
  way unless there is a strong reason not to).

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
  minute that the music has. Ideally CallerBuddy and look at the MP3 file and
  determine this, but if necessary the user can provide it.
- The _deltaDemo_. A signed decimal number (in BPM) that callerBuddy should
  modify the music

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

Thus once the app has a CallerBuddyRoot directory. it can look for a songs.json,
and generate one if needed (by scanning for MP3 files) These files can be
displayed int what feels like a row and column table (spreadsheet) with
filtering and the user can select songs to be included in the list.

Once the user has created the playlist he can move on to the 'playingPlaylist'
UI which shows the finished playlist, and keeps track of what has been played so
far. One of the options is to play the next song, which takes the user to
playingSong UI for that song.

The playingSong UI displays the lyrics (if available) and has controls for

- modifying the song (changing pitch tempo and volume)
- Controlling the playing of a the song (play button, stop, forward 2 sec ,
  forward 5 seconds, back 2 seconds, back five seconds, restart from the
  beginning)
- A slider that both shows the progress of the playing and allows the user to
  select an arbitrary spot in the song
- information like the time position in min:sec in the music, and the total
  playing time since reset, as well as a clock that displays the time of day. It
  should also show the total elapsed time since the song first played. It also
  shows the looping start and end (and the fact that they are set). Because
  singing calls have 7 equal sections, the slider should be visually divided
  into 7 sections so the caller can tell at a glance what section is currently
  being played. The slider should also show the loop start and end (if set)

When the song finishes, or the user closes the playingSong UI, the app goes back
to the 'playingPlaylist' UI. Normally square dances consist of a patter portion
(4-10 min with looped music and no lyrics) and a singing call (~4 min) playing a
song end-to-end (no loop) with lyrics. Followed by a break of typically 5
minutes when nothing is played. The playingPlayList UI should support this
pattern while being very flexible (sometimes the patter is skipped, or two
singing calls are performed, or it is just one singing call and nothing else, it
needs to be flexible). THe app identifies patter because it has no lyrics (that
is the definition from the apps point of view). This UI should allow a 0-10min
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

As always, best practices in UI design should be applied. In particular, cutter
should be kept to a minimum. It is OK however to use words (and not make
everything icons), as our audience is English speaking (however we should allow
for globalization, but it is not a priority for the first version). Features
need to discoverable, and tooltips should be used aggressively. The UI is likely
to be used on stage, which means mouse/touch is inconvenient so the UI should be
useful using just the keyboard (on the laptop), and the keyboard shortcuts
should be in the toolTips.

For inspiration for the UI, CallerBuddy should look toward either the VSCode, or
the Chrome browser. When possible actions should be possible via gestures
(dragging songs into the list, or changing song order by dragging the songs
around). Like VSCode, context menus (e.g. right click) should be preferred, and
menus should show the keyboard shortcuts so that the user can learn them as he
simply uses the app.

### Basic UI layout

The basic UI layout will be much like the Chrome Browser. The idea is that there
will be a bunch of tabs where real works happens, as the workflow proceeds, it
opens new tabs, but the old ones may stay around so you can 'back up' in the
workflow by clicking back to that tab (just like the Chrome browser) Like the
browser, there also needs to be a small UI element (e.g. upper right corner)
that controls things that are global to all workflows (like reopening the
welcome window to set the CallerBuddyRoot folder, or to bring up classic help
docs, app-wide user preferences, or app version information and upgrades)

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
similar a OS File Explorer UI, and so the UI details should mimic that UI. It
shows a list of things on the right side (which for us are SONGs) it will have
some text box at the top that allows those songs to be filtered. The songs will
be in a table gride with column heading (like a File Explorer), and you should
be able to filter on the columns (like how Google Sheets work) What is different
than a File Explorer UI is that the goal is to create the Playlist, which is a
list of song titles on the left. YOu can select a song on the right and right
click to put in at the beginning or end of the list, and you can drag the
selected line to the list and place it where you want in the order. You can also
grab items that are in the list and drag them to new places in the list.

A playlist editor has a OS folder associated with it which is where it gets is
songs from. WHen the CallerBuddyRoot is set, CallerBuddy will open a playlist
editor pointing a the CallerBuddyRoot.

Like the file explorer, in addition to songs in the right list, there can be
folders. These correspond to folders in the playlist editors folder. You can
open these folders change the playlists folder to folder the user indicated.
There should be a .. folder in the list (assuming you can go to the parent
folder, depending on how the folder APIs work the playlist may need to keep
track of its parent, and only show the .. folder when it is possible to do so)
You can also right click on the folder and open a NEW tab (playlist editor) with
the new folder to the right the current playlist editor but in the same tab(thus
you can have to editors open at the same time). They two editors to be able to
close independently of one another Thus they each probably have a title bar
(which is the name of the folder they represent, and X icon to close each). They
will both be operating on the same playlist (there is only one per app).
Playlist editors don't close automatically they need to be closed by the user
(the x on the tab or title bar).

There should be a button near (above) the playlist that indicates 'play'
(probably a triangle to the right)) clicking that will bring you to the
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

There is a play button (Probably a triangle pointing right). That will play the
currently selected song. When the song is done it will be grayed out. There is a
break timer on the right of this tab. It contains a textbox for the the time of
the break (default 5 min, user can set, and it is persisted in the setting.json
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
there is at most one playSong UI as well. The playListPlay UI should become
inactive (grayed) when the playSong UI is active (only one song playing at a
time)

#### playSong UI

When the play button in the playlistPlay UI is activated, it brings up a new tab
that plays a single song. This tab is dominated by a window on the left that
displays the lyrics (if present). Along the bottom of the UI is a slider that
represents the whole runtime of the song broken into 7 segments (alternate
colors to highlight the segments) YOu can use the slider to move to any point in
the song. On the right side are controls/information. There the standard song
playing buttons (play, stop, forward a bit (2 sec) forward more (10 sec)
backward a bit (2 sec) backward more (10 sec), and restart). In addition there
are controls for displaying the volume, pitch and tempo. around each values have
buttons on the left and right (triangles pointing left and right) that allow you
to tick the values up or down. There are also values for min:sec into the song,
min:sec for the total song playtime (which may be different because of looping
or seeking in the slider). There is also a clock showing the time of day.

If the song has no lyrics it is assumed to be a patter call and the looping
feature becomes active. All of this UI can be placed where the lyrics normally
go since they don't exist for patter. It can display the loop start and end (and
gray them out if inactive (loopEnd == 0)). The UI lets this values be modified,
there are also 'nudge' (10msec) nand 'big nudge (100 msec) buttons that move the
value in each direction. The loop start and end points are also shown on the
bottom slider, and and be set from there by moving the mark for each of these on
the slider. The start end end loop values are shown with 2 digits after the
decimal point so that users see the changes from nudges. Patter also will have a
'patterTime' countdown timer. There will be UI to set the amount of time
((default 5 min, user can set, and it is persisted in the setting.json file)),
and live countdown of how long the music was running. When countdown reaches
zero a sound is played (again unobtrusive) once (unlike the break timer it will
not chime again), the countdown continues past zero into negative numbers (color
changes red) so that the user knows how much over budget he is.

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

## Future Features

There are some features that we have explicitly cut from version 1 of this app,
but may impact how the code is written to make adding the later easier. These
include

- Finding the tempo of music simply by analyzing the MP3 data. If the digital
  signal processing code can reliably find the tempo (Beats per minute), it
  should to that and fill that in on the songs.json data for every song it
  encounters.
- Singing calls all have a similar structure of 7 parts that are each 64 beats
  long. Typically there is a short (4-16 beat) lead in, and a short (4-16 beat)
  trail out. The 7 parts consist of a opener, 2 figures, a middle break, two
  more figure, and closer. Before the non-figure components, there often can be
  a very short (2-4 beat) transition. If we could reliably find these points,
  that would be valuable, and instead of blindly breaking songs into 7 equal
  sections, we could break them into these sections based on the song data
  itself.
- Named playlists - In Version 1 playlists are ephemeral. You should be able to
  save them as named entities (probably represented as files with JSON in them)
- Song playing history - keep track of every day a song has been played to the
  end (Or near the end). Introduce the concept of practice, which is when
  playlists are short (e.g. single songs) or are designated as practice. Only
  non-practice (that is performances) are tracked. Then provide filters to avoid
  songs used in the last month or sort songs by the the amount of time since
  last use.
- Add editing of the lyrics - Typically callers buy songs on the internet that
  come in ZIP files that contain music (sometime with several variation of the
  song), and lyrics in various formats (html, docx, text ...). Depending on the
  recording company these ZIP files use different conventions. Sometimes they
  use the Label-Title format, sometimes just the label, sometimes the folder has
  the label-title and MP3 file has a generic name, When there are multiple
  variations, they all have different names, and the lyric name will only match
  one at most (and often not any of them). In short it is a mess. I want a UI
  that takes one of these ZIPs (Or a collection of ZIPs), and copies them into a
  somewhere under CallerBuddyRoot creating a good format (renaming them as
  needed, and selecting the variation that the caller prefers). This is all done
  by hand today, and some basic rules will create a good guess, that you can
  then confirm with the user, speeding things up a lot.
- lyric files tend to also have a wide variety of formats. As part of this
  conversion process, the original lyric files are transformed into either
  Markdown or some standard HTML, so that all lyrics will have a uniform format.
- adding choreography. Basically a database of sequence of calls, that are
  sorted by various parameters (what kinds of calls used etc)
- Potentially adding something like
  [Taminations sequencer](https://www.tamtwirlers.org/taminations/#/?main=SEQUENCER&formation=Squared+Set&helplink=info/sequencer)
- If we added the Taminations sequencer, seeing we can add speech recognition
  that is good enough that you can call with voice rather than type sequences.
