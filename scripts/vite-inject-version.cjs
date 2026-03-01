/**
 * Vite plugin: generates manifest.json and sw.js from version.ts + templates.
 * Runs at build/dev start so PWA artifacts always match the version in version.ts.
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

function generatePwaArtifacts() {
  const version = getVersion();
  const cacheName = "callerbuddy-v" + version.replace(/[^a-z0-9.]/gi, "-").replace(/-+/g, "-");
  const buildTime = new Date().toISOString();

  const manifestPath = path.join(root, "public", "manifest.template.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.version = version;
  fs.writeFileSync(
    path.join(root, "public", "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  const swTemplate = fs.readFileSync(path.join(root, "public", "sw.template.js"), "utf8");
  const swContent = swTemplate
    .replace("__CACHE_NAME__", cacheName)
    .replace("__BUILD_TIME__", buildTime);
  fs.writeFileSync(path.join(root, "public", "sw.js"), swContent);
}

function injectVersionPlugin() {
  return {
    name: "inject-version",
    buildStart() {
      generatePwaArtifacts();
    },
  };
}

module.exports = { injectVersionPlugin };
