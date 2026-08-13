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
3. **Cloud storage friendly** - meaning you can have your songs 'in the cloud'
   where they are backed up and accessible from multiple machines yet kept in
   sync (you logically only have one collection of songs) See 
   [Cloud Storage](#cloud-storage-for-your-songs).
4. **Works Offline** - CallerBuddy can run without any network connection, 
   so it will work in ALL venues.  See [Offline CallerBuddy](#offline-callerbuddy).
5. **Cross Platform** - CallerBuddy works on Windows,
   Macs (with Chrome Browser), Chromebooks, Linux, and Android phones (sadly 
   IPhone browsers do not support needed functionality, and are unsupported).
6. **Keyboard Friendly** - CallerBuddy has extensive keyboard shortcuts, that are easy 
   to learn with hover-over help.  You never need to be fiddling with a 
   mouse on stage, or looking for a cursor in sunny conditions. See [Keyboard Shortcuts](#keyboard-shortcuts).  
7. **Touch (Phone) Friendly** - For Android Phones, CallerBuddy is fully touch capable 
   (no keyboard needed) and the user interface 'fits' in the phones screen size.
   Your phone can definitely be your primary tool when giving performances.

## Expected Workflow 
### First Time Setup
When CallerBuddy is launched for the first time (or after it is reset from the ☰ menu), 
it will  display a welcome pane that asks the user to create or designate a
 **CallerBuddySongs** folder that will hold songs and the other data CallerBuddy needs.
However when  you relaunch CallerBuddy it will go strait into the 
[playlist editor](#playlist-editor). (Due to limitation on Android, you must go through 
a reconnection process first but you ultimately end in the playList editor).

## The App Menu

In the upper right corner of CallerBuddy is a ☰ icon that activates a menu of 
operations on CallerBuddy as a whole.   Resetting CallerBuddy, Importing Songs, 
and Help are in this menu, among other things.  

## Playlist Editor

CallerBuddy has the concept of a **playList**.  A playList is simply a list songs 
to be performed (probably sequentially) at a dance or workshop.   This lets 
you plan your dance so you are not fumbling for music during a performance.
To keep the flow simple and consistent, CallerBuddy requires a playList to play
even one song, but to all a single song to be played quickly it as a 'Play now'
capability (the ▶ icon, keyboard P), fuses both adding the song to the playlist and 
playing the song, so CallerBuddy has the 'feel' of being able to play a single song.

The editor consists of left pane that represents the set of songs in the current 
playlist, and the right is a table of songs in the CallBuddySongs folder.
The song table has the following columns

* **Title** - the title (name) of the song.  This is derived from the song's file name. 
* **Rank** - A number from 0 to 100 representing how much you like the song.  This is
  totally user defined (click on it to update), and defaults to 50.   Typically
  you sort by this to find your most popular songs.  
* **Last** Played - The number of days since CallerBuddy played this song.   Useful
  so you don't keep using the same songs and use every song from time to time.  
* **Played** Average - This is a running average of how many times the song was played
  in the last month.   See [How Played is Calculated](#how-the-played-average-is-calculated).  
* **Categories** - This is a set of user-defined words (click to update) 
   that allow you to group songs
   by a category (for example xmas, or patriotic or holiday).  The text filter functionally
   looks at these
* **Order** - A number that represents the order this song was added to CallerBuddySongs.
   Sorting by this lets you find your 'new songs'.  
* **Label** - The producer of a song has a short designation (a few letters and a number)
   that uniquely define the producer as well as the individual song.  Some songs do not
   have this, but when they do it sorting by it will allow you to find all the songs 
   by a particular producer (which often have a similar sound or style)
* **Type** - Indicates if the song is a Patter (no lyrics) or singing call (with Lyrics) 

To help choose a song, you sort by any of the columns above (by clicking on the column 
name), or typing values into the filter textbox or the Rank filter.

* If you type a word in the filter textbox only songs with that text somewhere in the 
  row will be displayed.
* If you type !WORD in the filter textbox only songs that do NOT have this word will
  be displayed. 
* You can set the >= <=  and the value to filter by rank value (thus look at only
  your popular or less popular songs)

You can add songs to the playlist clicking on the + (Or typing +), or by dragging a row
to the playlist area.   When you drag, you can place the song in the order you want
it by finishing the drag at the desired spot.    You can also rearrange songs already
on the playlist by dragging them to the desired spot.   Dragging on Android works, you 
simply touch and hold to start a drag.  

If you right click on a row of a song, all the operations you can perform on the song
are present in a context menu.   To support touch, there is a ⋮ icon at the far right
of each row that also gets you to this context menu.

You can remove items in the playList by clicking the X beside the entry, you can 
remove all entries in the list with the'Clear' button at the bottom

When you are happy with your playlist, click the 'Play' button (or type &lt;Enter&gt;)

## Now Playing

A completed playList moves on to the 'Now Playing' page.  This page represents 
your progress at a single performance.   Each song has a checkbox beside it 
that indicates if it has been played or not, and by default the first unchecked
song is selected.    Typing the **space bar**, or  &lt;Enter&gt; or clicking
the 'Play' button will play the selected song.   Thus in a typical dance 
you simply need to keep hitting the **space bar** to play the next song.

However you are free to modify your playlist during the performance.  
You don't have to go in the order you originally specified, simply use
mouse or **up/down arrow keys** to select a different song to play next.  **Double
clicking** on a song will pay that song independently of whether it is next
or has been played before.   If you change your mind and don't want to 
use on of the songs on your playlist, you can check its checkbox (indicating
it has been played) or **hit the X** icon to delete it entirely.  
You can also ****drag songs** to reorder them.
Finally you can go back to the playlist editor (using 
the **'Close'** button or the **Esc** key) add more songs to the playlist and then
come back to the playlist editor.   In short you can manipulate the 
playlist pretty much in any way on the fly.  

Often you might practice your performance, and so you will want
to reset the checkboxes back to 'unplayed' after your practice.  There
is a **'Reset'** button for this purpose.  

### The Break Timer

The other piece of functionality on the 'Now Playing' page is the break 
timer.   It is a simple count-down timer that runs after a song has been
played, and will chime when the countdown reaches zero (and then every
20 seconds after that).   You can set the amount of time, and you can 
turn the timer off if you don't need it.   

Finally CallerBuddy will tell you the time that last song ended, so that
even if you don't use the timer, you can know how long the break has been.  

Most times however, you just want to hit the **space bar**, which takes 
you to the song player for the next unplayed song on the playList. 

## Song Player

By default, when the Song player is activated, it immediately starts 
playing (because this is almost always what you want).  However if you
did not want it to play you can immediately hit the **space bar** or the 
&lt;Enter&gt; key to pause the music, and type '.' to reset the
music to the start.  

The Song Player is broken into two panes.  The left pane depends on 
whether the song is a singing call (has lyrics) or a patter (doesn't).
The right pane has the main controls for playing a song.  At the
top is standard audio controls (play, fast forward small, fast forward 
large, skip to end, rewind, rewind large, skip to beginning).   All of 
these buttons have keyboard shortcuts associated with them (hover to 
discover).  Below that are controls for adjusting volume, pitch and temp. 

### Adjust pitch and tempo

The following adjustments are remembered as part of the song so that
they are always optimal for you when you play them.  You should not
have to use these controls most of the time (you set the up once and
probably never touch them again)

* **Volume** (0–100): (v/V keys) This allows you to make sure that all
  songs have roughly the same volume regardless of the level used during recording.  
* **Pitch** (half-steps): (p/P keys) You should adjust each song so that
  it is in a pitch range that is easy for you to sing.   If you have
  to reach for high or low notes, you should adjust the pitch.  
* **Tempo** (BPM delta): (t/T keys) The number of beats per minute (BPM)
  is displayed on this line.   Generally 126 BPM is a good value for
  square dancing, but a younger crowd may want it faster (e.g. 128 or 129), and 
  an older or inexperienced crowd will want it slower (e.g. 123 or 124)

CallerBuddy keeps track of when songs are played and updates data 
shown in the playList editor with this data.   However if you are
practicing, you probably don't want this data updated.  That is what
the 'practice' checkbox is for.  WHen you check CallerBuddy assumes
any playing is no 'official' and does not update the play statistics.  

If you run CallerBuddy in a browser, it is pretty easy for the window
for CallerBuddy to get 'lost' if you navigate away from it.  If music
is playing while this is happening, it can be very annoying.  By 
default CallerBuddy enables an 'Auto-Pause' feature where CallerBuddy
will stop playing if its window loses focus.  This does not solve the
problem of finding the window again, but it does stop the music, and
allow you to simply open a new version (which remembers where you were
so that you can continue one reasonably quickly).  However if you 
are calling over a Zoom connection, Auto-Pause is dangerous because
you expect to move focus back and forth between CallerBuddy and Zoom.
For cases like this there is a checkbox to turn off Auto-Pause.  

As the bottom of the right pane of the song player is a a button that
for singing calls invokes the [lyric editor](#lyric-editor).  For
patter is will create a lyric file.  If the song is truly patter you
don't need lyrics (it will become a singing call if you add lyrics).
However you might have singing call but you don't have lyrics.  In this
case you can import it as a patter (since there are no lyrics) and use
'Create Lyrics' to make lyrics after the fact. 

### The Song Progress Bar 

Along the bottom of the Song player is a progress bar that shows where
in the song the sound is currently playing.   If you click there 
you can move the current position to a new position.  The bar is 
divided into 7 equal segments that roughly map into the 7 parts of
a singing call.  When playing a singing call these regions are labeled.
This is quite useful so you can remind yourself which section is
next (it is easy to forget if you get distracted).

When playing patter, CallerBuddy has the concept of looping, and the
end point (in red) and the restart point (in green) are shown on the 
progress bar.  You can drag these to change where looping happens, but
generally you will want to use more precise controls described below.  

### The left pane in the Song Player

When a singing call is being played, the left pane displays the lyrics
for the song, it also becomes the [lyric editor](#lyric-editor) when
the 'Edit Lyrics' button is pressed.   The lyrics can be scrolled 
using the wheel mouse, the track-pad (two finger slide) or the up/down
arrow keys.  

### Setting loop points for patter

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

## The patter timer

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


## Lyric Editor
TODO not done.  


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


### Subfolders

If your CallerBuddy folder has subfolders, they appear as
folder rows at the top of the song table. Click a folder to
open it in a new tab. Both tabs share the same playlist, so
you can add songs from different folders.




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


## How the Played Average is Calculated
TODO Fill in.  

## Keyboard Shortcuts
### Global (all views)
| Key              | Action                   |
| ---------------- | ------------------------ |
| Ctrl+]           | Next tab                 |
| Ctrl+[           | Previous tab             |
| Ctrl+< or Ctrl+, | Go back (tab history)    |
| Ctrl+> or Ctrl+. | Go forward (tab history) |
| Ctrl+W           | Close current tab        |

### Now Playing shortcuts
| Key           | Action                            |
| ------------- | --------------------------------- |
| Enter / Space | Play selected song                |
| Ctrl+R        | Reset played status for all songs |
| S             | Start/stop break timer            |
| Esc           | Close Now Playing tab             |

### Song Player shortcuts
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

### Loop Controls (patter songs, when focused)
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