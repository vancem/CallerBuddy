/**
 * Convert lyrics HTML (import / scrape output) to CallerBuddy Markdown.
 *
 * Browser-safe (DOMParser). Same rules as demoMusic/html-lyrics-to-md.mjs.
 */

export interface HtmlToMdRemoval {
  kind: string;
  detail?: string;
}

export interface HtmlToMdResult {
  markdown: string;
  removals: HtmlToMdRemoval[];
}

const BLOCK_TAGS = new Set(["h1", "h2", "p"]);

/** Convert a full HTML lyrics document (or body fragment) to Markdown. */
export function htmlToLyricsMarkdown(html: string): HtmlToMdResult {
  const removals: HtmlToMdRemoval[] = [];
  const note = (kind: string, detail?: string) => {
    removals.push(detail ? { kind, detail } : { kind });
  };

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

  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  if (!body) {
    return { markdown: "", removals };
  }

  body.querySelectorAll("style, script").forEach((el) => el.remove());

  const blocks: string[] = [];

  function normText(s: string): string {
    return s
      .replace(/\u00a0/g, " ")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t\f\v]+/g, " ");
  }

  function nodeToLines(root: Node, opts: { asHeading?: boolean } = {}): string[] {
    const lines: string[] = [];
    let cur = "";

    const pushLine = () => {
      lines.push(cur.replace(/[ \t]+$/g, "").replace(/^[ \t]+/g, ""));
      cur = "";
    };

    const walk = (node: Node, wrap: { bold?: boolean } = {}) => {
      if (node.nodeType === Node.COMMENT_NODE) return;

      if (node.nodeType === Node.TEXT_NODE) {
        const t = normText(node.textContent || "").replace(/\n+/g, " ");
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
      const el = node as Element;
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
        if (trimmed && !trimmed.startsWith("*") && !trimmed.startsWith("_")) {
          const lead = inserted.match(/^\s*/)?.[0] || "";
          const trail = inserted.match(/\s*$/)?.[0] || "";
          cur = `${cur.slice(0, before)}${lead}_${trimmed}_${trail}`;
        }
        return;
      }

      for (const child of el.childNodes) walk(child, wrap);
    };

    walk(root);
    if (cur.length || lines.length === 0) pushLine();
    while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();

    if (opts.asHeading && lines.length) {
      const out: string[] = [];
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

  function joinHardBreaks(lines: string[]): string {
    const cleaned = lines.map((l) => l.replace(/[ \t]+$/g, ""));
    const parts: string[] = [];
    let run: string[] = [];
    const flush = () => {
      if (!run.length) return;
      for (const line of run) parts.push(`${line}\\`);
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

  function collapseSpaces(s: string): string {
    return s.replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n");
  }

  function handleBlock(el: Element) {
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
        const clone = el.cloneNode(true) as Element;
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

    if (
      tag === "span" &&
      (el.getAttribute("class") || "").split(/\s+/).includes("info")
    ) {
      const infoText = normText(el.textContent || "").trim();
      if (infoText) blocks.push(`_${infoText}_`);
      return;
    }

    const lines = nodeToLines(el).filter((l) => l.trim());
    if (lines.length) blocks.push(joinHardBreaks(lines));
  }

  function flushInlineRun(nodes: Node[]) {
    if (!nodes.length) return;
    const wrap = doc.createElement("div");
    for (const n of nodes) wrap.appendChild(n.cloneNode(true));
    const lines = nodeToLines(wrap);
    const usable: string[] = [];
    for (const l of lines) {
      if (l.trim()) usable.push(l);
      else if (usable.length) usable.push("");
    }
    while (usable.length && !usable[usable.length - 1].trim()) usable.pop();
    if (!usable.length) return;
    blocks.push(joinHardBreaks(usable));
  }

  let inlineRun: Node[] = [];
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
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (BLOCK_TAGS.has(tag)) {
      flush();
      handleBlock(el);
      continue;
    }

    if (
      tag === "span" &&
      (el.getAttribute("class") || "").split(/\s+/).includes("info")
    ) {
      flush();
      handleBlock(el);
      continue;
    }

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

  const seen = new Set<string>();
  const uniq: HtmlToMdRemoval[] = [];
  for (const r of removals) {
    const key = `${r.kind}|${r.detail || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(r);
  }

  return { markdown: md, removals: uniq };
}

function cleanupDecorativeAsterisks(
  md: string,
  note: (kind: string, detail?: string) => void,
): string {
  let out = md;

  out = out.replace(/(?<=[^*\s])\*\*\*\*(?=[^*\s])/g, "** **");

  const beforeSep = out;
  out = out.replace(/\*{3,}/g, "");
  if (out !== beforeSep) note("decorative-asterisks", "Removed ***+ separator runs");

  const beforeLead = out;
  out = out.replace(/(^|\n)\*\*[ \t]+/g, "$1");
  out = out.replace(/(^|\n)\*\*(?=[A-Za-z0-9][^*\n]*$)/gm, "$1");
  out = out.replace(/(^|\n)\*(?!\*)(?=[A-Za-z0-9])/g, "$1");
  if (out !== beforeLead) {
    note("decorative-asterisks", "Removed line-leading * / ** markers");
  }

  out = out.replace(/[ \t]{2,}/g, " ");
  out = out.replace(/^[ \t]+/gm, "");
  return out;
}
