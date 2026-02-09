# Pre-release and release process

This doc describes how to ship a versioned pre-release so you can experience the
full PWA flow end-to-end.

## Version number

- **Single source of truth:** `package.json` → `version`
- On every `npm run dev` and `npm run build`, the version is injected into:
  - **App UI** – shown in the welcome view (e.g. “v0.1.0-pre.1”)
  - **PWA manifest** – `public/manifest.json` → `version`
  - **Service worker** – cache name is `callerbuddy-v<version>` so each release
    gets a new cache and users get the new build

Bumping the version (e.g. to `0.1.0-pre.2`) and rebuilding is enough for cache
invalidation and visible versioning.

## End-to-end pre-release flow (GitHub Pages)

### 1. One-time: enable GitHub Pages

1. In your repo: **Settings → Pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions**

### 2. Cut a pre-release

1. **Bump version** in `package.json` (e.g. `0.1.0-pre.1` → `0.1.0-pre.2`).
2. **Commit and push** to `main`:
   ```bash
   git add package.json
   git commit -m "chore: bump version to 0.1.0-pre.2"
   git push origin main
   ```
3. The **Deploy preview** workflow runs automatically:
   - Installs deps, runs `inject-version` (with `BASE_PATH` = repo name), builds
     with Vite
   - Uploads `dist` and deploys to GitHub Pages

### 3. Open the PWA like a user would

1. Go to **https://&lt;your-username&gt;.github.io/CallerBuddy/** (replace with
   your GitHub username and repo name). e.g.
   <https://vancem.github.io/CallerBuddy/>
2. Use the site over HTTPS (required for service worker and install).
3. **Install the PWA** (e.g. Chrome: ⋮ → “Install CallerBuddy” or the install
   icon in the address bar).
4. Open the installed app from your home screen or app list and use it like a
   released app.

### 4. Optional: manual build and preview locally

To test the production build and versioning locally:

```bash
# Same as CI (for repo “CallerBuddy”)
set BASE_PATH=CallerBuddy
npm run build
npm run preview
```

Then open the URL shown (e.g. `http://localhost:4173/CallerBuddy/`). To simulate
“root” deployment (e.g. custom domain), leave `BASE_PATH` unset:

```bash
npm run build
npm run preview
```

## Version format

- **Pre-release:** `0.1.0-pre.1`, `0.1.0-pre.2`, …
- **First real release:** `0.1.0` or `1.0.0`
- Bump in `package.json` only; the rest is driven by `npm run inject-version`
  (via `predev` / `prebuild`).

## What you get from this flow

- A **version in the app** so you and testers know which build is running.
- **Cache busting** on each version via the service worker cache name.
- A **deployed, installable PWA** on GitHub Pages so you can test install,
  updates, and behavior in a real environment.

## Troubleshooting: 404 at your Pages URL

If **https://&lt;your-username&gt;.github.io/CallerBuddy/** returns 404:

1. **Enable Pages from GitHub Actions (most common cause)**  
   In the repo: **Settings → Pages**. Under **Build and deployment**, set **Source** to **GitHub Actions** (not “Deploy from a branch”). Save. Without this, the workflow does not publish your site.

2. **Confirm the workflow ran and succeeded**  
   Open the **Actions** tab. Find the latest **Deploy preview** run for your push. If it failed, fix the reported error (e.g. build failure). If it never ran, ensure the workflow file is on `main` and that you pushed to `main`.

3. **Wait a minute after the first deploy**  
   The first deployment can take 1–2 minutes to go live. Refresh the URL after the workflow shows a green check.

4. **Use the exact project URL**  
   The URL must be `https://&lt;username&gt;.github.io/&lt;repo-name&gt;/` with the **exact** repo name (e.g. `CallerBuddy` with that casing). No trailing path unless you added one in the app.
