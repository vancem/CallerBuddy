/**
 * Generates test data for CallerBuddy development.
 *
 * Creates a `test-data/` folder at the project root with:
 *  - 3 WAV audio files following the LABEL - TITLE.wav naming convention
 *  - 2 matching HTML lyrics files (one song has no lyrics = patter)
 *  - These files can be used by pointing CallerBuddyRoot at the test-data folder
 *
 * The WAV files are simple sine-wave tones, ~60–90 seconds each.
 *
 * Usage:  node scripts/generate-test-data.cjs
 */

const fs = require("fs");
const path = require("path");

const OUT_DIR = path.resolve(__dirname, "..", "test-data");

// -- WAV file generation (PCM, 16-bit, mono) --------------------------------

function generateWav(durationSec, freq, sampleRate = 44100) {
  const numSamples = Math.floor(durationSec * sampleRate);
  const dataSize = numSamples * 2; // 16-bit = 2 bytes per sample
  const fileSize = 44 + dataSize;

  const buf = Buffer.alloc(fileSize);
  let off = 0;

  // RIFF header
  buf.write("RIFF", off); off += 4;
  buf.writeUInt32LE(fileSize - 8, off); off += 4;
  buf.write("WAVE", off); off += 4;

  // fmt  sub-chunk
  buf.write("fmt ", off); off += 4;
  buf.writeUInt32LE(16, off); off += 4;        // sub-chunk size
  buf.writeUInt16LE(1, off); off += 2;         // PCM format
  buf.writeUInt16LE(1, off); off += 2;         // mono
  buf.writeUInt32LE(sampleRate, off); off += 4; // sample rate
  buf.writeUInt32LE(sampleRate * 2, off); off += 4; // byte rate
  buf.writeUInt16LE(2, off); off += 2;         // block align
  buf.writeUInt16LE(16, off); off += 2;        // bits per sample

  // data sub-chunk
  buf.write("data", off); off += 4;
  buf.writeUInt32LE(dataSize, off); off += 4;

  // Generate sine wave with gentle fade-in and fade-out
  const fadeLen = Math.min(sampleRate * 2, numSamples / 4); // 2-second fade
  for (let i = 0; i < numSamples; i++) {
    let amp = 0.4;
    if (i < fadeLen) amp *= i / fadeLen;
    if (i > numSamples - fadeLen) amp *= (numSamples - i) / fadeLen;

    const sample = Math.round(amp * 32767 * Math.sin(2 * Math.PI * freq * i / sampleRate));
    buf.writeInt16LE(sample, off); off += 2;
  }

  return buf;
}

// -- Lyrics HTML generation -------------------------------------------------

function lyricsHtml(title, label, verses) {
  const verseHtml = verses.map(v => `<p class="verse">${v}</p>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${label} - ${title}</title>
  <style>
    body {
      font-family: Georgia, serif;
      max-width: 600px;
      margin: 2em auto;
      line-height: 1.8;
      color: #222;
    }
    h1 { font-size: 1.4em; margin-bottom: 0.3em; }
    .label { color: #888; font-size: 0.9em; }
    .verse { margin: 1.2em 0; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p class="label">${label}</p>
${verseHtml}
</body>
</html>
`;
}

// -- Main -------------------------------------------------------------------

function main() {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  // Song 1: Singing call (has lyrics)
  const song1Name = "SQD 101 - Sunny Side Singing";
  fs.writeFileSync(
    path.join(OUT_DIR, song1Name + ".wav"),
    generateWav(90, 440), // A4, 90 seconds
  );
  fs.writeFileSync(
    path.join(OUT_DIR, song1Name + ".html"),
    lyricsHtml("Sunny Side Singing", "SQD 101", [
      "Opener:<br>Circle left and walk around the ring,<br>Walk right back, let's hear the caller sing.<br>Swing your partner, promenade along,<br>This is just a sunny singing song.",
      "Figure 1:<br>Heads go forward, back, then star thru,<br>Pass thru, do-sa-do like you always do.<br>Swing the corner lady round and round,<br>Promenade that girl back home to town.",
      "Figure 2:<br>Sides go forward, back, then star thru,<br>Pass thru, do-sa-do like you always do.<br>Swing the corner lady round and round,<br>Promenade that girl back home to town.",
      "Middle Break:<br>Circle left around the old dance hall,<br>Walk right back, have a ball.<br>Swing your partner, promenade the floor,<br>Dance a little more and then some more.",
      "Figure 3:<br>Heads go forward, back, then star thru,<br>Pass thru, do-sa-do like you always do.<br>Swing the corner lady round and round,<br>Promenade that girl back home to town.",
      "Figure 4:<br>Sides go forward, back, then star thru,<br>Pass thru, do-sa-do like you always do.<br>Swing the corner lady round and round,<br>Promenade that girl back home to town.",
      "Closer:<br>Circle left and walk around the ring,<br>Walk right back, let's hear the caller sing.<br>Swing your partner, promenade the floor,<br>That's the end, there is no more!",
    ]),
  );

  // Song 2: Singing call (has lyrics)
  const song2Name = "RYL 202 - Mountain Morning";
  fs.writeFileSync(
    path.join(OUT_DIR, song2Name + ".wav"),
    generateWav(75, 523.25), // C5, 75 seconds
  );
  fs.writeFileSync(
    path.join(OUT_DIR, song2Name + ".html"),
    lyricsHtml("Mountain Morning", "RYL 202", [
      "Opener:<br>Bow to your partner, bow to the corner too,<br>Circle to the left with the morning dew.<br>Reverse back, allemande left the corner girl,<br>Do-sa-do your own and promenade the world.",
      "Figure 1:<br>Heads square thru, four hands round you go,<br>Meet that corner, do-sa-do.<br>Swing thru, boys run to the right,<br>Promenade her home in the morning light.",
      "Figure 2:<br>Sides square thru, four hands round you go,<br>Meet that corner, do-sa-do.<br>Swing thru, boys run to the right,<br>Promenade her home in the morning light.",
      "Middle Break:<br>Four ladies chain across the way,<br>Chain right back and hear me say.<br>Swing your partner, promenade the ring,<br>Mountain morning makes me want to sing.",
      "Figure 3:<br>Heads square thru, four hands round you go,<br>Meet that corner, do-sa-do.<br>Swing thru, boys run to the right,<br>Promenade her home in the morning light.",
      "Figure 4:<br>Sides square thru, four hands round you go,<br>Meet that corner, do-sa-do.<br>Swing thru, boys run to the right,<br>Promenade her home in the morning light.",
      "Closer:<br>Bow to your partner, bow to the corner too,<br>Circle to the left with the morning dew.<br>Swing your partner, promenade the land,<br>Mountain morning, isn't life grand!",
    ]),
  );

  // Song 3: Patter (no lyrics)
  const song3Name = "PTR 301 - Steady Groove Patter";
  fs.writeFileSync(
    path.join(OUT_DIR, song3Name + ".wav"),
    generateWav(120, 329.63), // E4, 120 seconds
  );
  // No lyrics file for patter

  console.log(`Test data generated in: ${OUT_DIR}`);
  console.log("Files:");
  fs.readdirSync(OUT_DIR).forEach((f) => console.log("  " + f));
  console.log("\nPoint CallerBuddy at this folder to test the app.");
}

main();
