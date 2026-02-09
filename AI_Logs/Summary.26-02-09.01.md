# PWA versioning and pre-release setup – summary

## 1. Version number (single source of truth)

- **`package.json`** – `version` is set to **`0.1.0-pre.1`** and is the only place you edit the version.
- On every **`npm run dev`** and **`npm run build`**, **`scripts/inject-version.cjs`** runs and:
  - Writes **`src/version.ts`** (used by the app).
  - Updates **`public/manifest.json`** with that version.
  - Regenerates **`public/sw.js`** with a versioned cache name (`callerbuddy-v0.1.0-pre.1`) so each release gets a new cache and users get updates.

## 2. Version in the app

- The welcome view shows **v0.1.0-pre.1** at the bottom so you can confirm which build is running.

## 3. Pre-release deployment (GitHub Pages)

- **`.github/workflows/deploy-preview.yml`** runs on push to `main` (and via “Run workflow”).
- It sets **`BASE_PATH`** to the repo name so the app is built for **`https://<username>.github.io/CallerBuddy/`**.
- **`vite.config.ts`** uses **`BASE_PATH`** for the app’s `base` URL; the inject script uses it for the service worker cache URLs.

**One-time setup:** In the repo go to **Settings → Pages**, and set **Source** to **GitHub Actions**.

## 4. End-to-end flow (what you do)

1. **Bump version** in `package.json` (e.g. to `0.1.0-pre.2`).
2. **Commit and push** to `main` (e.g. `git add package.json && git commit -m "chore: bump to 0.1.0-pre.2" && git push`).
3. After the workflow finishes, open **https://&lt;your-username&gt;.github.io/CallerBuddy/**.
4. Use **Install** (browser install prompt or menu) and use the installed PWA like a real app.

Full step-by-step and versioning details are in **`RELEASE.md`**.

---

**Local test with same base as GitHub Pages:**

```powershell
$env:BASE_PATH="CallerBuddy"; npm run build; npm run preview
```

Then open the URL shown and you’ll get the same base path as in production.
