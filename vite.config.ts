import { defineConfig } from "vite";

// For GitHub Pages: set BASE_PATH to your repo name, e.g. BASE_PATH=/CallerBuddy
const basePath = (process.env.BASE_PATH || "").replace(/\/?$/, "");
const base = basePath ? `/${basePath}/` : "/";

export default defineConfig({
  base,
  server: {
    open: false,   // use ctrl-click on the URL to open in browser
  },
});