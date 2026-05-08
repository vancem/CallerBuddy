/* Serve Vite dist/ as if it were a GitHub Pages project site:
 * - mounted at /<BASE_PATH>/ (default: "CallerBuddy")
 * - SPA fallback to index.html for client-side routes
 * - optional HTTPS if SSL_KEY + SSL_CERT are provided (helps with PWA behavior on LAN)
 */
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { URL } = require("node:url");
const { createReadStream } = require("node:fs");

const distDir = path.resolve(process.cwd(), "dist");
if (!fs.existsSync(distDir)) {
  console.error('dist/ does not exist. Run "npm run build" first.');
  process.exit(1);
}

const BASE_PATH = (process.env.BASE_PATH || "CallerBuddy").replace(/^\/+|\/+$/g, "");
const MOUNT = `/${BASE_PATH}/`;
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || "0.0.0.0";

const SSL_KEY = process.env.SSL_KEY;
const SSL_CERT = process.env.SSL_CERT;

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function isProbablySpaRoute(urlPath) {
  // If it has a file extension, treat it as an asset request.
  return path.extname(urlPath) === "";
}

function safeJoinDist(relPath) {
  const decoded = decodeURIComponent(relPath);
  const normalized = decoded.replace(/\\/g, "/");
  const joined = path.join(distDir, normalized);
  const resolved = path.resolve(joined);
  if (!resolved.startsWith(distDir)) return null;
  return resolved;
}

function sendFile(res, filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    res.statusCode = 200;
    res.setHeader("Content-Type", contentType(filePath));
    res.setHeader("Content-Length", String(stat.size));
    res.setHeader("Cache-Control", "no-cache");
    createReadStream(filePath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

function handler(req, res) {
  const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const urlPath = reqUrl.pathname || "/";

  // Compatibility: if the build was produced with Vite base="/", the generated
  // index.html will reference root-absolute assets like "/assets/...".
  // For local preview, serve those from dist/ as well so the page doesn't go blank.
  if (
    urlPath.startsWith("/assets/") ||
    urlPath === "/manifest.json" ||
    urlPath === "/sw.js" ||
    urlPath === "/callerBuddy.svg"
  ) {
    const relRoot = urlPath.replace(/^\/+/, "");
    const candidateRoot = safeJoinDist(relRoot);
    if (candidateRoot && sendFile(res, candidateRoot)) return;
    // Fall through to mounted handling / 404.
  }

  // Root convenience redirect (Pages-style users always land on /CallerBuddy/)
  if (urlPath === "/" || urlPath === `/${BASE_PATH}`) {
    res.statusCode = 302;
    res.setHeader("Location", MOUNT);
    res.end();
    return;
  }

  if (!urlPath.startsWith(MOUNT)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(`Not found. This server mounts the app at ${MOUNT}`);
    return;
  }

  // Strip /CallerBuddy/ prefix. GitHub Pages effectively does this mounting.
  let rel = urlPath.slice(MOUNT.length);
  if (rel === "" || rel.endsWith("/")) rel += "index.html";

  const candidate = safeJoinDist(rel);
  if (candidate && sendFile(res, candidate)) return;

  // SPA fallback: serve index.html for client-side routes under the mount.
  if (isProbablySpaRoute(urlPath)) {
    const indexPath = path.join(distDir, "index.html");
    if (sendFile(res, indexPath)) return;
  }

  res.statusCode = 404;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.end("Not found.");
}

const server =
  SSL_KEY && SSL_CERT
    ? https.createServer(
        {
          key: fs.readFileSync(SSL_KEY),
          cert: fs.readFileSync(SSL_CERT),
        },
        handler,
      )
    : http.createServer(handler);

server.listen(PORT, HOST, () => {
  const proto = SSL_KEY && SSL_CERT ? "https" : "http";
  console.log(`Serving dist/ mounted at ${MOUNT}`);
  console.log(`Local:   ${proto}://localhost:${PORT}${MOUNT}`);
  console.log(
    `Network: ${proto}://${HOST === "0.0.0.0" ? "<your-lan-ip>" : HOST}:${PORT}${MOUNT}`,
  );
  if (!(SSL_KEY && SSL_CERT)) {
    console.log(
      "Tip: set SSL_KEY and SSL_CERT to enable HTTPS (better PWA behavior on LAN).",
    );
  }
});

