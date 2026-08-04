/// <reference types="vitest/config" />
import { createRequire } from "module";
import { copyFileSync, createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";
import type { Connect, Plugin } from "vite";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);
const { injectVersionPlugin } = require("./scripts/vite-inject-version.cjs");

/** On-demand demo songs: served/copied from demoMusic/, never precached. */
const DEMO_MUSIC_FILES = [
  "Maple Leaf Rag.mp3",
  "Maple Leaf Rag.md",
  "Entertainer.mp3",
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

function markdownPlugin(): Plugin {
  return {
    name: "vite-markdown",
    transform(code, id) {
      if (!id.endsWith(".md")) return;
      const html = marked.parse(code, { async: false }) as string;
      return { code: `export const html = ${JSON.stringify(html)};`, map: null };
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
