/// <reference types="vitest/config" />
import { createRequire } from "module";
import { copyFileSync, createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { Marked } from "marked";
import customHeadingId from "marked-custom-heading-id";
import { gfmHeadingId } from "marked-gfm-heading-id";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";

/** Help markdown only: GFM auto-slugs + explicit `{#id}` (custom wins when present). */
const helpMarked = new Marked();
helpMarked.use(gfmHeadingId(), customHeadingId());

const require = createRequire(import.meta.url);
const { injectVersionPlugin } = require("./scripts/vite-inject-version.cjs");

/** On-demand demo songs: served/copied from demoMusic/, never precached. */
const DEMO_MUSIC_FILES = [
  "When the Saints Go Marching In.mp3",
  "When the Saints Go Marching In.md",
  "Cotton Eyed Joe.mp3",
] as const;

function demoContentType(name: string): string {
  if (name.endsWith(".mp3")) return "audio/mpeg";
  if (name.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}

function demoMusicPlugin(): Plugin {
  const demoDir = join(process.cwd(), "demoMusic");

  function tryServeDemo(
    req: Connect.IncomingMessage,
    res: Connect.ServerResponse,
    next: Connect.NextFunction,
    base: string,
  ) {
    const rawUrl = req.url?.split("?")[0] ?? "";
    let pathname = rawUrl;
    const basePrefix = base.endsWith("/") ? base.slice(0, -1) : base;
    if (basePrefix && pathname.startsWith(basePrefix)) {
      pathname = pathname.slice(basePrefix.length) || "/";
    }
    if (!pathname.startsWith("/demo/")) {
      next();
      return;
    }
    const name = decodeURIComponent(pathname.slice("/demo/".length));
    if (!(DEMO_MUSIC_FILES as readonly string[]).includes(name)) {
      next();
      return;
    }
    const filePath = join(demoDir, name);
    if (!existsSync(filePath)) {
      res.statusCode = 404;
      res.end("Demo file not found");
      return;
    }
    try {
      const { size } = statSync(filePath);
      res.statusCode = 200;
      res.setHeader("Content-Type", demoContentType(name));
      res.setHeader("Content-Length", String(size));
      res.setHeader("Cache-Control", "public, max-age=86400");
      createReadStream(filePath).pipe(res);
    } catch (err) {
      next(err);
    }
  }

  return {
    name: "callerbuddy-demo-music",
    configureServer(server) {
      const base = server.config.base || "/";
      server.middlewares.use((req, res, next) => {
        tryServeDemo(req, res, next, base);
      });
    },
    configurePreviewServer(server) {
      const base = server.config.base || "/";
      server.middlewares.use((req, res, next) => {
        tryServeDemo(req, res, next, base);
      });
    },
    writeBundle(options) {
      const outDir = options.dir || join(process.cwd(), "dist");
      const destDir = join(outDir, "demo");
      mkdirSync(destDir, { recursive: true });
      for (const name of DEMO_MUSIC_FILES) {
        copyFileSync(join(demoDir, name), join(destDir, name));
      }
    },
  };
}

/**
 * Turn relative `<img src="...">` paths into Vite asset imports so help images
 * are emitted to dist and get correct URLs (with `base`) at runtime.
 * Absolute / remote / data URLs are left unchanged.
 */
function bundleRelativeHelpImages(
  html: string,
  mdFilePath: string,
): { parts: string[]; importLines: string[] } {
  const mdDir = dirname(mdFilePath);
  const importLines: string[] = [];
  const parts: string[] = [];
  let lastIndex = 0;

  const re = /<img\b([^>]*?)\bsrc=(["'])([^"']+)\2([^>]*)>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const src = match[3];
    const full = match[0];
    const before = match[1];
    const quote = match[2];
    const after = match[4];

    if (/^(?:https?:|data:|\/\/)/i.test(src) || src.startsWith("/")) {
      continue;
    }

    const abs = resolve(mdDir, decodeURIComponent(src));
    if (!existsSync(abs)) {
      console.warn(`[vite-markdown] missing image "${src}" (from ${mdFilePath})`);
      continue;
    }

    const index = importLines.length;
    let relImport = relative(mdDir, abs).replace(/\\/g, "/");
    if (!relImport.startsWith(".")) relImport = `./${relImport}`;

    const varName = `__mdImg${index}`;
    importLines.push(`import ${varName} from ${JSON.stringify(relImport)};`);

    parts.push(html.slice(lastIndex, match.index));
    parts.push(`<img${before}src=${quote}`);
    parts.push(varName); // sentinel: import binding, not a string literal
    parts.push(`${quote}${after}>`);
    lastIndex = match.index + full.length;
  }
  parts.push(html.slice(lastIndex));

  return { parts, importLines };
}

/** Build `export const html = "…" + __mdImg0 + "…" + …` from mixed string/binding parts. */
function helpHtmlExportExpression(parts: string[], importCount: number): string {
  if (importCount === 0) {
    return `export const html = ${JSON.stringify(parts.join(""))};`;
  }
  const expr = parts
    .map((part) =>
      /^__mdImg\d+$/.test(part) ? part : JSON.stringify(part),
    )
    .join(" + ");
  return `export const html = ${expr};`;
}

function markdownPlugin(): Plugin {
  return {
    name: "vite-markdown",
    transform(code, id) {
      // Ignore virtual ids with queries (e.g. "?raw") that are not help markdown.
      if (!id.endsWith(".md")) return;
      const parsed = helpMarked.parse(code, { async: false }) as string;
      const { parts, importLines } = bundleRelativeHelpImages(parsed, id);
      return {
        code: [...importLines, helpHtmlExportExpression(parts, importLines.length)].join(
          "\n",
        ),
        map: null,
      };
    },
  };
}

// For GitHub Pages: set BASE_PATH to your repo name, e.g. BASE_PATH=/CallerBuddy
const basePath = (process.env.BASE_PATH || "").replace(/\/?$/, "");
const base = basePath ? `/${basePath}/` : "/";

export default defineConfig({
  plugins: [injectVersionPlugin(), markdownPlugin(), demoMusicPlugin()],
  base,
  test: {
    globals: true,
    environment: "jsdom",
    exclude: ["e2e/**", "node_modules/**"],
  },
  server: {
    open: false, // use ctrl-click on the URL to open in browser
    watch: {
      // Ignore files that CallerBuddy writes at runtime.  Without this, writing
      // CallerBuddySongs.json or CallerBuddySettings.json into a CallerBuddyRoot
      // that lives inside the project tree (e.g. test-data/) triggers a Vite
      // full-page reload that kills the async initialization flow mid-flight.
      ignored: [
        "**/test-data/**",
        "**/CallerBuddySongs.json",
        "**/CallerBuddySettings.json",
      ],
    },
  },
});
