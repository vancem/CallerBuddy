# Future features

These item have been moved out of the current release, but we don't want to lose
track of them. But they are low priority right now.

- [] Finding the tempo of music simply by analyzing the MP3 data. If the digital
  signal processing code can reliably find the tempo (Beats per minute), it
  should to that and fill that in on the songs.json data for every song it
  encounters.
- [] Singing calls all have a similar structure of 7 parts that are each 64
  beats long. Typically there is a short (4-16 beat) lead in, and a short (4-16
  beat) trail out. The 7 parts consist of a opener, 2 figures, a middle break,
  two more figure, and closer. Before the non-figure components, there often can
  be a very short (2-4 beat) transition. If we could reliably find these points,
  that would be valuable, and instead of blindly breaking songs into 7 equal
  sections, we could break them into these sections based on the song data
  itself.
- [] Named playlists - In Version 1 playlists are ephemeral. You should be able
  to save them as named entities (probably represented as files with JSON in
  them)
- [] Song playing history - keep track of every day a song has been played to
  the end (Or near the end). Introduce the concept of practice, which is when
  playlists are short (e.g. single songs) or are designated as practice. Only
  non-practice (that is performances) are tracked. Then provide filters to avoid
  songs used in the last month, or sort songs by the amount of time since last
  use.
- [] Add editing of the lyrics - Typically callers buy songs on the internet
  that come in ZIP files that contain music (sometimes with several variations
  of the song), and lyrics in various formats (html, docx, text...). Depending
  on the recording company, these ZIP files use different conventions. Sometimes
  they use the Label-Title format, sometimes just the label, sometimes the
  folder has the label-title and the MP3 file has a generic name. When there are
  multiple variations, they all have different names, and the lyric name will
  match at most one (and often not any of them). In short, it is a mess. I want
  a UI that takes one of these ZIPs (Or a collection of ZIPs), and copies them
  into a somewhere under CallerBuddyRoot creating a good format (renaming them
  as needed, and selecting the variation that the caller prefers). This is all
  done by hand today, and some basic rules will create a good guess, that you
  can then confirm with the user, speeding things up a lot.
- [] Lyric files tend to have a wide variety of formats. As part of this
  conversion process, the original lyric files are transformed into either
  Markdown or standard HTML, so that all lyrics will have a uniform format.
- [] Adding choreography: basically a database of sequences of calls that are
  sorted by various parameters (what kinds of calls are used, etc.)
- [] Potentially adding something like
  [Taminations sequencer](https://www.tamtwirlers.org/taminations/#/?main=SEQUENCER&formation=Squared+Set&helplink=info/sequencer)
- [] If we added the Taminations sequencer, then we can add speech recognition
  that is good enough that you can call with voice rather than type sequences.
