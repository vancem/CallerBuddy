import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Marked } from "marked";
import { gfmHeadingId } from "marked-gfm-heading-id";
import { HELP_TOC } from "./help-toc.js";

const SRC_DIR = join(process.cwd(), "src");
const HELP_MD = join(SRC_DIR, "help-content.md");

function headingIdsFromHelpMarkdown(): Set<string> {
  const marked = new Marked();
  marked.use(gfmHeadingId());
  const md = readFileSync(HELP_MD, "utf8");
  const html = marked.parse(md, { async: false }) as string;
  const ids = new Set<string>();
  for (const m of html.matchAll(/<h[1-6][^>]*\sid="([^"]+)"/gi)) {
    ids.add(m[1]!);
  }
  return ids;
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules") continue;
      out.push(...listTsFiles(path));
    } else if (ent.name.endsWith(".ts") && !ent.name.endsWith(".test.ts")) {
      out.push(path);
    }
  }
  return out;
}

function codeHelpSectionIds(): string[] {
  const patterns = [
    /openHelpSection\(\s*"([^"]+)"\s*\)/g,
    /openHelp\(\s*"([^"]+)"\s*\)/g,
    /onHelp\(\s*"([^"]+)"\s*\)/g,
    /sectionId:\s*"([^"]+)"/g,
  ];
  const ids: string[] = [];
  for (const file of listTsFiles(SRC_DIR)) {
    const text = readFileSync(file, "utf8");
    for (const re of patterns) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        ids.push(m[1]!);
      }
    }
  }
  return ids;
}

function markdownHashTargets(): string[] {
  const md = readFileSync(HELP_MD, "utf8");
  return [...md.matchAll(/\[[^\]]+\]\(#([^)]+)\)/g)].map((m) => m[1]!);
}

describe("help table of contents and links", () => {
  const headingIds = headingIdsFromHelpMarkdown();

  it("every TOC entry matches a heading in help-content.md", () => {
    const missing = HELP_TOC.map((e) => e.id).filter((id) => !headingIds.has(id));
    expect(missing, `unknown TOC ids: ${missing.join(", ")}`).toEqual([]);
  });

  it("every in-app help jump targets an existing heading", () => {
    const missing = [...new Set(codeHelpSectionIds())].filter(
      (id) => !headingIds.has(id),
    );
    expect(missing, `code help links with no heading: ${missing.join(", ")}`).toEqual(
      [],
    );
  });

  it("every hash link in help-content.md targets an existing heading", () => {
    const missing = [...new Set(markdownHashTargets())].filter(
      (id) => !headingIds.has(id),
    );
    expect(missing, `broken help markdown links: ${missing.join(", ")}`).toEqual([]);
  });
});
