import fs from "node:fs";

const p =
  "C:/Users/Vance/OneDrive/Documents/callerSchool/CallBuddyBackup/CallerBuddySongs.json";
const songs = JSON.parse(fs.readFileSync(p, "utf8"));
const now = new Date(2026, 8, 29, 15, 0, 0);
function start(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function days(iso) {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Math.floor((start(now) - start(t)) / 86400000);
}
const want = [
  "One Call Away",
  "Joy To The World",
  "Lord Of The Dance",
  "Love Grows",
  "You've Got A Friend In Me",
  "City Of New Orleans",
  "Lonely Drum",
  "Ob La Di",
  "Beautiful Sunday",
  "Neon Moon",
  "Real Good Feel Good Song",
  "Dancing Queen",
  "Boogie Shoes",
  "Marry You",
  "Those Were The Days",
  "Cups",
  "Venus",
  "Thank You For Being A Friend",
  "Feeling Groovy",
  "King Of The Road",
  "Witch Doctor",
  "Walkin On Sunshine",
  "Can't Take My Eyes Off You",
];
for (const title of want) {
  const matches = songs.filter((s) => s.title === title);
  if (!matches.length) {
    console.log("MISSING | " + title);
    continue;
  }
  for (const s of matches) {
    console.log(
      [s.musicFile, s.label, s.rank, days(s.lastUsed), s.playWeight, s.lastUsed].join(
        " | ",
      ),
    );
  }
}
console.log("TOTAL", songs.length);
