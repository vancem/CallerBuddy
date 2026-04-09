/**
 * Vite plugin: generates manifest.json and sw.js from version.ts + templates.
 * Runs at build/dev start so PWA artifacts always match the version in version.ts.
 *
 * At build time, a writeBundle hook rewrites sw.js in the output directory with
 * the full list of generated assets so they are precached on install.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

function getVersion() {
  const versionTs = fs.readFileSync(path.join(root, "src", "version.ts"), "utf8");
  const m = versionTs.match(/APP_VERSION = "([^"]+)"/);
  if (!m) throw new Error("Could not parse APP_VERSION from src/version.ts");
  return m[1];
}

function generateSwJs(cacheName, buildTime, precacheUrls, outputPath) {
  const swTemplate = fs.readFileSync(path.join(root, "public", "sw.template.js"), "utf8");
  const swContent = swTemplate
    .replace("__CACHE_NAME__", cacheName)
    .replace("__BUILD_TIME__", buildTime)
    .replace('"__PRECACHE_URLS__"', JSON.stringify(precacheUrls));
  fs.writeFileSync(outputPath, swContent);
}

function injectVersionPlugin() {
  let cacheName, buildTime;

  return {
    name: "inject-version",

    buildStart() {
      const version = getVersion();
      cacheName =
        "callerbuddy-v" +
        version.replace(/[^a-z0-9.]/gi, "-").replace(/-+/g, "-");
      buildTime = new Date().toISOString();

      // manifest.json
      const manifestPath = path.join(root, "public", "manifest.template.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      manifest.version = version;
      fs.writeFileSync(
        path.join(root, "public", "manifest.json"),
        JSON.stringify(manifest, null, 2)
      );

      // sw.js with minimal precache (sufficient for dev where SW isn't registered)
      generateSwJs(
        cacheName,
        buildTime,
        ["", "index.html"],
        path.join(root, "public", "sw.js")
      );
    },

    writeBundle(options, bundle) {
      // Production build: regenerate sw.js with the full asset list so every
      // JS/CSS bundle is available offline immediately after install.
      const seen = new Set(["", "index.html"]);
      const precacheUrls = ["", "index.html"];
      for (const fileName of Object.keys(bundle)) {
        if (seen.has(fileName)) continue;
        if (fileName === "sw.js" || fileName === "manifest.json") continue;
        if (fileName.endsWith(".map")) continue;
        precacheUrls.push(fileName);
        seen.add(fileName);
      }
      const outDir = options.dir || path.join(root, "dist");
      generateSwJs(cacheName, buildTime, precacheUrls, path.join(outDir, "sw.js"));
    },
  };
}

module.exports = { injectVersionPlugin };
