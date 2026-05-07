import fs from "node:fs/promises";
import path from "node:path";

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walk(p);
    } else {
      yield p;
    }
  }
}

function updateMargin(html) {
  // Replace any "margin: 1em;" (allowing whitespace/case) with "margin: 0;"
  return html.replace(/margin\s*:\s*1em\s*;/gi, "margin: 0;");
}

async function main() {
  const root = process.argv[2];
  if (!root) {
    console.error("Usage: node scripts/update-html-margin.mjs <rootDir>");
    process.exit(2);
  }

  let scanned = 0;
  let changed = 0;
  let hits = 0;

  for await (const filePath of walk(root)) {
    if (!filePath.toLowerCase().endsWith(".html")) continue;
    scanned++;

    const before = await fs.readFile(filePath, "utf8");
    const matchCount = (before.match(/margin\s*:\s*1em\s*;/gi) ?? []).length;
    if (matchCount === 0) continue;

    const after = updateMargin(before);
    if (after !== before) {
      await fs.writeFile(filePath, after, "utf8");
      changed++;
      hits += matchCount;
    }
  }

  console.log(
    JSON.stringify(
      { root, htmlFilesScanned: scanned, filesChanged: changed, replacements: hits },
      null,
      2,
    ),
  );
}

await main();
