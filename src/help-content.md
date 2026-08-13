# Welcome to CallerBuddy

CallerBuddy is a web-based program that Square Dance Callers can use to play
music during performances.  Here are some useful features.  

1. **Web or App** - CallerBuddy can be used just as a web site in your browser, 
   but it can also be installed as normal desktop app (so you can launch it 
   from your taskbar, or placed on the desktop).
   See [Installing CallerBuddy](#running-callerbuddy-outside-the-browser).
2. **Safe To Run** - You don't need to worry that you are 
   compromising the safety of your machine when you run CallerBuddy.  See 
   [CallerBuddy Security](#callerbuddy-security). 
3. **Cloud storage friendly** meaning you can have your songs 'in the cloud'
   where they are backed up and accessible from multiple machines yet kept in
   sync (you logically only have one collection of songs) See 
   [Cloud Storage](#cloud-storage-for-your-songs).
4. **Works Offline** - CallerBuddy can run without any network connection, 
   so it will work in ALL venues.  See [Offline CallerBuddy](#offline-callerbuddy).
5. **Cross Platform**  It works on Windows,
   Macs (with Chrome Browser), Chromebooks, Linux, and Android phones (sadly 
   IPhone browsers do not support needed functionality, and are unsupported).
6. **Keyboard Friendly** - CallerBuddy has extensive keyboard shortcuts, that are easy 
   to learn with hover-over help.  You never need to be fiddling with a 
   mouse on stage, or looking for a cursor in sunny conditions.
7. **Touch Friendly** For Android Phones, CallerBuddy is fully touch capable 
   (no keyboard needed) and the user interface 'fits' in the phones screen size.  
   Your phone can definitely be your primary tool when giving performances. 

## Expected Workflow 
### First Time Setup
When CallerBuddy is launched for the first time (or after it is reset from the ☰ menu), 
it will  display a welcome pane that asks the user to create or designate a
 **CallerBuddySongs** folder that hold songs and the other data CallerBuddy needs.
However when  you relaunch CallerBuddy it will go strait into the 
[playlist editor](#playlist-editor). (Due to limitation on Android, you must go through a reconnection process first but you ultimately end in the playList editor).

## Playlist Editor

CallerBuddy has the concept of a playList.  A playList is simply a list songs 
to be performed (probably sequentially) at a dance or workshop.   This lets 
you plan your dance so you are not fumbling for music during a performance.


The Playlist Editor is where you browse a folder of songs and
build the playlist you'll perform. The left pane is your
**playList**; the right pane is the **song table** for the
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

### 3. Playing the dance

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





## CallerBuddy Security

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
'sandbox' which restricts the page from doing dangerous things (like touching
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

![CallerBuddy Install ScreenShot](images/CallerBuddyEdge.png)

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

## Cloud Storage for your Songs

There is a pretty good chance that you are already using CallerBuddy 
with cloud storage.   That is because when you first set up your
your **CallerBuddySongs** folder, you probably did it in your Documents
folder, and on most operating systems this folder will be set up
for Cloud Storage (since most of the files you create are in this
folder, they end up in the cloud, and CallerBuddy is just one specific
case of this)

Since CallerBuddy puts EVERYTHING it needs into the **CallerBuddySongs**
folder this means that everything CallerBuddy needs is already in 
the cloud, which means you can get at it from other computers.  For 
example:
  1. Use [CallerBuddy ](https://vancem.github.io/CallerBuddy/) to set up a **CallerBuddySongs** on one laptop (in the Documents folder)
  2. Log in to another laptop and use [CallerBuddy ](https://vancem.github.io/CallerBuddy/)
  to access the SAMPLE **CallerBuddySongs** folder from another laptop.  
Indeed in CallerBuddy's initial welcome page, it has a button for 
creating a **CallerBuddySongs** from scratch and another button for 
connecting to a existing **CallerBuddySongs** folder for just this purpose.  

Thus you can get at all your songs from any computer that can get at
your cloud storage.  This includes the songs and lyrics of course but
it also includes all the options you set (volume, pitch, tempo), as well
as songs rank and usage statistics.  It will also remember your preferences
(like how long your break timer is), and what your current playlist is.  

### Run only one CallerBuddy at a time

This is all great, but is is important to realize that CallerBuddy is
really not expecting two versions of the program to be running simultaneously.
CallerBuddy won't let files be corrupted, but if two programs are running
and modifying the same things (like the settings, or playlist) it is 
possible that one copy will overwrite what the other copy changed 
in surprising ways (typically it will look like you lost edits).  The 
simple advice is to avoid letting more than one copy run at once.  If 
you leave one copy running at home and then start another at a performance, 
that is OK, but when you get back home you should probably restart it.  

### Cloud Storage and the Android Phone (Google Drive)

CallerBuddy work quite well on Android phones (unfortunately IPhone only
half-heartedly supports PWA apps and CallerBuddy does not work).  However,
Android's support for PWA apps does not include support for Microsoft's 
One Drive cloud files (which is what is used by default on Windows machines).
On the other hand, Microsoft Windows (and Mac) DOES have support for Google Drive.  
Thus if you wish to have a single place in the cloud that all of your
devices (Windows, Android phone, Chromebooks, Macs), can access, you should
use Google Drive.  If you will only be using CallerBuddy on Windows, then
you can simply leave your **CallerBuddySongs** folder in the Documents folder
(effectively using Microsoft One Drive to store your songs in the cloud).  
If you use cloud storage, however please see the [Offline CallerBuddy](#offline-callerbuddy) section to make sure that CallerBuddyWorks when you don't have network connectivity.

#### Using Google Drive from All Platforms

The main reason you would want to install google drive is so you can access
the same files on your Android phone and your laptop computer.   This means
you already have Google account, and it is already set up on your phone.  This
simplifies the steps need to the following. 

 *  On the desktop, go to [Google Drive Install](https://support.google.com/a/users/answer/13022292?hl=en) and install the Google Drive. 
 *  Launch Google Drive, and sign into your account.  

 Once you do this, whenever you are choosing files you will see an additional
 top level 'Google Drive' option in the left pane.    For example here is 
 what the folder chooser looks like in CallerBuddy, if GoogleDrive is installed 
 on the machine. 

![Windows Google Drive Screenshot](images/GoogleDriveExample.png)

Thus when running creating a **CallerBuddySongs** folder you can simply create
the folder underneath the Google Drive (Under the Google Drive is always a 'My Drive'
folder, put it in that folder (or its subfolders)).

Note that don't have to start from scratch.  If you already have **CallerBuddySongs**
folder set up somewhere else (e.g. Documents), you can simply use the file explorer 
to move this folder from wherever it was to somewhere under GoogleDrive -> My Drive.
CallerBuddy really does not know or care exactly where the **CallerBuddySongs** folder
lives, it just needs access to it.  

Once you have your **CallerBuddySongs** on your Google Drive you can start up 
CallerBuddy, and set the **CallerBuddySongs** folder on the phone to the location on
the Google Drive (Use the Reset CallerBuddy on the ☰ menu if needed)

Note that the folder chooser dialog hides the Google Drive.   When choosing a folder
you must activate the ☰ menu in the upper left corner, and then you can choose
the Google Drive and then locater (or create) your **CallerBuddySongs** folder. 

![Android Google Drive Screenshot](images/GoogleDriveAndroid.png)

From here you now have a folder that is equally accessible from Android Phones, Chromebooks,
Windows or a Mac.   But you still need to do the do the setup in [Offline CallerBuddy](#offline-callerbuddy) to make sure it work without the network.  

## Offline CallerBuddy

By default, CallerBuddy is designed so that all its non-setup functionality works
offline.   This is true whether CallerBuddy is being run in the browser or as a
app outside the browser.    However CallerBuddy DOES need to get at files in the
**CallerBuddySongs** folder and if that folder lives in the Cloud, then by default
you will need to have network access to get at these files.   One way of solving
this is to simply put your **CallerBuddySongs** folder in a non-Cloud folder.   
However if you do this, your songs will only be accessible from that particular
machine and they will not be backed up, so you could lose data if your hardware
fails.   This NOT recommended. 

Instead, both Google Drive and Microsoft One Drive and the notion that the 
file is 'available offline'.  If this is set on a particular file or folder 
then the cloud Drive software keeps a local copy on the local machine so that
you can access the file without a network connection.   This is not the default
however, so we need to set it.   Basically bring up your file explorer application
and select the **CallerBudddy**.  On windows they hide the offline capabilities.
You have to right click -> Show More Options -> Offline Access -> Available Offline. 

![Windows Offline Screenshot](images/WindowOffline.png)

On ChromeBook, their file explorer app displays the offline capability as a switch at 
the top of the display that can be turned on and off for the selected folder/file
at the top of the display.

![Chromebook Offline Screenshot](images/ChromeBookOffline.png)

On Android Phone, you access the Offline capabilities through the Google Drive application
available for free on the Android Play Store.  This app acts very much like a 
File explorer.  **Inexplicably** and **Unfortunately** it does not allow you to 
set a folder offline (like we did on both windows, and chromebook and mac) but 
you CAN set individual files as offline.   Thus to achieve this effect, you must 
for every file click on the ⋮ on the right side, and then select 'Make available
offline'.  The example below shows this for the CallerBuddySettings.json file. 

![Android Offline Screenshot](images/AndroidOffline.png)

You know you have succeeded on any particular file because there is a dark circle 
with a check inside it that indicates that is available offline.   Note you don't
need to do the files for every song (as long as you don't need them offline), but 
you DO need the CallerBuddy*.json files show above.  These are where CallerBuddy
stores the Settings and Song information that CallerBuddy needs to do just about
anything, so of they are not available offline, CallerBuddy will fail/hang.   

### Offline Workflows

Offline files work quite well.  You have ONE copy that is logically in the cloud
but is available from any machine.  You always get the up to date copy (logically
there is only one), and you get backup for free (because local copies exist on
all your machines (as well as the cloud)).   

Offline files do have a problem if two different machines are offline and each
modify the same files while offline.   There is no perfect solution here.  
The software will bring up user interface and ask you to chose a winner
(some edits will be destroyed).   This is unlikely, but you can make it 
**impossible** by insuring that you don't leave CallerBuddy running on 
different computers.   That way it is very easy to make sure that only one
copy of CallerBuddy is every running at any one time, and if this is true
the files in **CallerBuddySongs** will never run into the situation that 
creates a conflict.   This is the recommended workflow.  

## Importing Songs

TODO this is a placeholder for explaining cloud storage.  

# How-to Guides

Quick recipes for common tasks. Each guide assumes you already
have CallerBuddy set up with a folder.


## Adding Songs to CallerBuddy

### Import songs from a ZIP file

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

## Import songs from a folder

If your songs were already extracted from a ZIP (or came as loose
files), use the folder import instead.

1. Click **☰ menu** → **Import Song from Folder…**
2. Pick the folder containing the MP3 and HTML files.
3. The same Import Review screen appears. Review and click
  **Import**.

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



## Adjust pitch and tempo

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

## Set up loop points for patter

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

## Use the patter timer

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
5. Press S or click **Start/Stop**
  to manually control the timer.



## Edit lyrics

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

## Lyrics Markdown

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
**≥** or **<** a threshold.
Leave it empty to disable.


## Now Playing

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



## Song Player

The Song Player plays one song at a time, with a **?** button in
the top-right corner of the left pane that opens this overview.

- **Singing calls** show scrolling lyrics on the left; the right
panel has transport, Volume/Pitch/Tempo, and Categories/Rank.
- **Patter** songs show loop controls and a patter timer on the
left instead of lyrics.
- See "Adjust pitch and tempo", "Set up loop points for patter",
"Use the patter timer", and "Edit lyrics" above for
details on each control.



# Keyboard Shortcuts



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




# Glossary

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