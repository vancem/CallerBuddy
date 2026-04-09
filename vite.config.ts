/// <reference types="vitest/config" />
import { createRequire } from "module";
import { marked } from "marked";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);
const { injectVersionPlugin } = require("./scripts/vite-inject-version.cjs");

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
  plugins: [injectVersionPlugin(), markdownPlugin()],
  base,
  test: {
    globals: true,
    exclude: ["e2e/**", "node_modules/**"],
  },
  server: {
    open: false, // use ctrl-click on the URL to open in browser
    watch: {
      // Ignore files that CallerBuddy writes at runtime.  Without this, writing
      // songs.json or settings.json into a CallerBuddyRoot that lives inside
      // the project tree (e.g. test-data/) triggers a Vite full-page reload
      // that kills the async initialization flow mid-flight.
      ignored: ["**/test-data/**", "**/songs.json", "**/settings.json"],
    },
  },
});