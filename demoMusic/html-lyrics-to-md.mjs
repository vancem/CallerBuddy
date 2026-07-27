#!/usr/bin/env node
/**
 * Convert CallerBuddy lyrics HTML to straightforward Markdown.
 *
 * Usage:
 *   node demoMusic/html-lyrics-to-md.mjs [inputDir] [outputDir]
 *
 * Defaults:
 *   inputDir  = demoMusic/songArchiveHtml
 *   outputDir = demoMusic/songArchiveMd
 *
 * Rules:
 *   - <h1> → # Title
 *   - span.info → italic on the next line (_authorship_)
 *   - <h2> → ## Heading (text kept; styles dropped)
 *   - <br> → trailing \ (including the last line of a lyric block)
 *   - <b>/<strong> → **text**
 *   - Styling-only markup dropped; displayed text kept
 *   - Decorative literal * / ** sequences removed
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_IN = path.join(__dirname, "songArchiveHtml");
const DEFAULT_OUT = path.join(__dirname, "songArchiveMd");

/** @typedef {{ kind: string, detail?: string }} Removal */
/** @typedef {{ file: string, removals: Removal[] }} FileReport */

const BLOCK_TAGS = new Set(["h1", "h2", "p"]);

/**
 * @param {string} html
 * @returns {{ markdown: string, removals: Removal[] }}
 */
export function htmlLyricsToMarkdown(html) {
  /** @type {Removal[]} */
  const removals = [];
  const note = (kind, detail) => {
    removals.push(detail ? { kind, detail } : { kind });
  };

  // Report unusual / browser-cruft cleanups only (not universal <style>/head strip).
  if (/<!--/.test(html)) {
    const lit = (html.match(/<!--\?lit\$[^>]*-->/g) || []).length;
    const other = (html.match(/<!--[\s\S]*?-->/g) || []).length - lit;
    if (lit > 0) note("lit-comments", `${lit} Lit comment(s) stripped`);
    if (other > 0) note("html-comments", `${other} HTML comment(s) stripped`);
  }
  if (/style\s*=/i.test(html)) {
    note("inline-style", "Dropped inline style= attributes (text kept)");
  }
  if (/<div\b/i.test(html)) {
    note("div-tags", "Converted <div> wrappers to line breaks (text kept)");
  }

  const dom = new JSDOM(html);
  const { document } = dom.window;
  const Node = document.defaultView.Node;
  const body = document.body;
  if (!body) {
    return { markdown: "", removals };
  }

  body.querySelectorAll("style, script").forEach((el) => el.remove());

  /** @type {string[]} */
  const blocks = [];

  /** @param {string} s */
  function normText(s) {
    return s
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t\f\v]+/g, " ");
  }

  /**
   * @param {Node} root
   * @param {{ asHeading?: boolean }} [opts]
   * @returns {string[]}
   */
  function nodeToLines(root, opts = {}) {
    /** @type {string[]} */
    const lines = [];
    let cur = "";

    const pushLine = () => {
      lines.push(cur.replace(/[ \t]+$/g, "").replace(/^[ \t]+/g, ""));
      cur = "";
    };

    /**
     * @param {Node} node
     * @param {{ bold?: boolean }} wrap
     */
    const walk = (node, wrap = {}) => {
      if (node.nodeType === Node.COMMENT_NODE) return;

      if (node.nodeType === Node.TEXT_NODE) {
        let t = normText(node.textContent || "").replace(/\n+/g, " ");
        if (!t) return;
        if (wrap.bold) {
          const m = t.match(/^(\s*)([\s\S]*?)(\s*)$/);
          const lead = m?.[1] || "";
          const mid = m?.[2] || "";
          const trail = m?.[3] || "";
          cur += mid ? `${lead}**${mid}**${trail}` : t;
        } else {
          cur += t;
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = /** @type {Element} */ (node);
      const tag = el.tagName.toLowerCase();

      if (tag === "br") {
        pushLine();
        return;
      }

      if (tag === "b" || tag === "strong") {
        for (const child of el.childNodes) walk(child, { bold: true });
        return;
      }

      if (tag === "div") {
        if (cur.trim()) pushLine();
        for (const child of el.childNodes) walk(child, wrap);
        if (cur.trim()) pushLine();
        return;
      }

      if (tag === "span") {
        const cls = el.getAttribute("class") || "";
        if (cls.split(/\s+/).includes("info")) {
          const text = normText(el.textContent || "").trim();
          if (text) cur += `_${text}_`;
          return;
        }
        for (const child of el.childNodes) walk(child, wrap);
        return;
      }

      if (tag === "i" || tag === "em") {
        const before = cur.length;
        for (const child of el.childNodes) walk(child, wrap);
        const inserted = cur.slice(before);
        const trimmed = inserted.trim();
        if (trimmed && !trimmed.startsWith("*")) {
          const lead = inserted.match(/^\s*/)?.[0] || "";
          const trail = inserted.match(/\s*$/)?.[0] || "";
          cur = `${cur.slice(0, before)}${lead}*${trimmed}*${trail}`;
        }
        return;
      }

      for (const child of el.childNodes) walk(child, wrap);
    };

    walk(root);
    if (cur.length || lines.length === 0) pushLine();
    while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();

    if (opts.asHeading && lines.length) {
      const out = [];
      let headed = false;
      for (const line of lines) {
        if (!headed) {
          if (!line.trim()) continue;
          out.push(line.trim());
          headed = true;
        } else {
          out.push(line);
        }
      }
      return out;
    }

    return lines;
  }

  /** @param {string[]} lines */
  function joinHardBreaks(lines) {
    const cleaned = lines.map((l) => l.replace(/[ \t]+$/g, ""));
    /** @type {string[]} */
    const parts = [];
    /** @type {string[]} */
    let run = [];
    const flush = () => {
      if (!run.length) return;
      for (const line of run) {
        parts.push(`${line}\\`);
      }
      run = [];
    };
    for (const line of cleaned) {
      if (line.trim() === "") {
        flush();
        if (parts.length && parts[parts.length - 1] !== "") parts.push("");
      } else {
        run.push(line.trimEnd());
      }
    }
    flush();
    return parts.join("\n");
  }

  /** @param {string} s */
  function collapseSpaces(s) {
    return s.replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n");
  }

  /** @param {Element} el */
  function handleBlock(el) {
    const tag = el.tagName.toLowerCase();

    if (tag === "h1") {
      const lines = nodeToLines(el, { asHeading: true });
      const title = (lines[0] || "").trim();
      if (title) blocks.push(`# ${title}`);
      for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) blocks.push(joinHardBreaks([lines[i]]));
      }
      return;
    }

    if (tag === "h2") {
      const lines = nodeToLines(el, { asHeading: true });
      if (!lines.length) return;
      blocks.push(`## ${lines[0].trim()}`);
      if (lines.length > 1) {
        const rest = lines.slice(1).filter((l) => l.trim());
        if (rest.length) blocks.push(joinHardBreaks(rest));
      }
      return;
    }

    if (tag === "p") {
      const h1 = el.querySelector(":scope > h1");
      const info = el.querySelector("span.info");
      if (h1) {
        handleBlock(h1);
        if (info) {
          const infoText = normText(info.textContent || "").trim();
          if (infoText) blocks.push(`_${infoText}_`);
        }
        const clone = /** @type {Element} */ (el.cloneNode(true));
        clone.querySelectorAll("h1, span.info").forEach((n) => n.remove());
        const leftover = nodeToLines(clone).filter((l) => l.trim());
        if (leftover.length) blocks.push(joinHardBreaks(leftover));
        return;
      }

      if (
        info &&
        normText(el.textContent || "").trim() ===
          normText(info.textContent || "").trim()
      ) {
        const infoText = normText(info.textContent || "").trim();
        if (infoText) blocks.push(`_${infoText}_`);
        return;
      }

      const lines = nodeToLines(el);
      if (!lines.some((l) => l.trim())) return;
      blocks.push(joinHardBreaks(lines.filter((l) => l.trim())));
      return;
    }

    if (tag === "span" && (el.getAttribute("class") || "").split(/\s+/).includes("info")) {
      const infoText = normText(el.textContent || "").trim();
      if (infoText) blocks.push(`_${infoText}_`);
      return;
    }

    const lines = nodeToLines(el).filter((l) => l.trim());
    if (lines.length) blocks.push(joinHardBreaks(lines));
  }

  /** Flush a run of loose inline body nodes as one lyric block. */
  /** @param {Node[]} nodes */
  function flushInlineRun(nodes) {
    if (!nodes.length) return;
    const wrap = document.createElement("div");
    for (const n of nodes) wrap.appendChild(n.cloneNode(true));
    const lines = nodeToLines(wrap);
    /** @type {string[]} */
    const usable = [];
    for (const l of lines) {
      if (l.trim()) usable.push(l);
      else if (usable.length) usable.push("");
    }
    while (usable.length && !usable[usable.length - 1].trim()) usable.pop();
    if (!usable.length) return;
    blocks.push(joinHardBreaks(usable));
  }

  /** @type {Node[]} */
  let inlineRun = [];
  const flush = () => {
    flushInlineRun(inlineRun);
    inlineRun = [];
  };

  for (const node of [...body.childNodes]) {
    if (node.nodeType === Node.COMMENT_NODE) continue;

    if (node.nodeType === Node.TEXT_NODE) {
      if (normText(node.textContent || "").trim()) inlineRun.push(node);
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = /** @type {Element} */ (node);
    const tag = el.tagName.toLowerCase();

    if (BLOCK_TAGS.has(tag)) {
      flush();
      handleBlock(el);
      continue;
    }

    // Orphan info span between title pieces
    if (tag === "span" && (el.getAttribute("class") || "").split(/\s+/).includes("info")) {
      flush();
      handleBlock(el);
      continue;
    }

    // Everything else (b, br, div, styled span, loose text tags) stays in the flow
    inlineRun.push(node);
  }
  flush();

  let md = blocks
    .map((b) => b.replace(/[ \t]+\n/g, "\n").trimEnd())
    .filter((b, i, arr) => !(b === "" && (i === 0 || arr[i - 1] === "")))
    .join("\n\n");

  md = collapseSpaces(md);
  md = cleanupDecorativeAsterisks(md, note);
  md = md.replace(/\n{3,}/g, "\n\n").trim() + "\n";

  const seen = new Set();
  const uniq = [];
  for (const r of removals) {
    const key = `${r.kind}|${r.detail || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(r);
  }

  return { markdown: md, removals: uniq };
}

/**
 * @param {string} md
 * @param {(kind: string, detail?: string) => void} note
 */
function cleanupDecorativeAsterisks(md, note) {
  let out = md;

  // Adjacent </b><b> → **word****word**: only when **** sits between non-asterisk text.
  out = out.replace(/(?<=[^*\s])\*\*\*\*(?=[^*\s])/g, "** **");

  // Decorative separators: *** or longer (***** Music *****)
  const beforeSep = out;
  out = out.replace(/\*{3,}/g, "");
  if (out !== beforeSep) note("decorative-asterisks", "Removed ***+ separator runs");

  const beforeLead = out;
  // "** text" decorative marker
  out = out.replace(/(^|\n)\*\*[ \t]+/g, "$1");
  // Unbalanced line-leading **Word… (no closing ** on the line) e.g. Hallelujah / Proud Mary
  out = out.replace(/(^|\n)\*\*(?=[A-Za-z0-9][^*\n]*$)/gm, "$1");
  // Line-leading single *Word… (not **bold**, not *italic*)
  out = out.replace(/(^|\n)\*(?!\*)(?=[A-Za-z0-9])/g, "$1");
  if (out !== beforeLead) {
    note("decorative-asterisks", "Removed line-leading * / ** markers");
  }

  out = out.replace(/[ \t]{2,}/g, " ");
  out = out.replace(/^[ \t]+/gm, "");
  return out;
}

/**
 * @param {string} inputDir
 * @param {string} outputDir
 */
async function convertDir(inputDir, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const names = await fs.readdir(inputDir);
  const htmlFiles = names.filter((n) => /\.html?$/i.test(n)).sort();

  /** @type {FileReport[]} */
  const reports = [];
  let ok = 0;

  for (const name of htmlFiles) {
    const inPath = path.join(inputDir, name);
    const outName = name.replace(/\.html?$/i, ".md");
    const outPath = path.join(outputDir, outName);
    const html = await fs.readFile(inPath, "utf8");
    const { markdown, removals } = htmlLyricsToMarkdown(html);
    await fs.writeFile(outPath, markdown, "utf8");
    ok++;
    if (removals.length) reports.push({ file: name, removals });
  }

  return { ok, total: htmlFiles.length, reports };
}

async function main() {
  const inputDir = path.resolve(process.argv[2] || DEFAULT_IN);
  const outputDir = path.resolve(process.argv[3] || DEFAULT_OUT);

  console.log(`Converting:\n  from: ${inputDir}\n  to:   ${outputDir}`);
  const { ok, total, reports } = await convertDir(inputDir, outputDir);
  console.log(`\nWrote ${ok}/${total} markdown files.`);

  if (!reports.length) {
    console.log("\nNo special cleanups beyond baseline conversion.");
    return;
  }

  console.log(`\n=== Cleanup report (${reports.length} files) ===\n`);
  for (const r of reports) {
    console.log(r.file);
    for (const rem of r.removals) {
      console.log(`  - ${rem.kind}${rem.detail ? `: ${rem.detail}` : ""}`);
    }
    console.log("");
  }

  const reportPath = path.join(outputDir, "_conversion-report.json");
  await fs.writeFile(reportPath, JSON.stringify(reports, null, 2), "utf8");
  console.log(`Full report JSON: ${reportPath}`);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
