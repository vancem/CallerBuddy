/**
 * Basic E2E tests for CallerBuddy.
 *
 * These cover the core happy path: app startup, folder selection, playlist
 * building, and brief song playback. The File System Access API is fully
 * mocked in-browser via addInitScript so no real files are needed.
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Mock File System Access API — injected into the page before app scripts run
// ---------------------------------------------------------------------------

/**
 * Sets up an in-memory mock of the File System Access API with 3 test songs:
 *   - SQD 101 - Sunny Side Singing (singing call, has lyrics)
 *   - RYL 202 - Mountain Morning   (singing call, has lyrics)
 *   - PTR 301 - Steady Groove Patter (patter, no lyrics)
 *
 * Audio files are 1-second sine-wave WAVs generated on the fly.
 */
function setupMockFileSystem(opts?: { missingAudio?: boolean }) {
  function generateWav(durationSec: number, freq: number): ArrayBuffer {
    const sampleRate = 44100;
    const numSamples = Math.floor(durationSec * sampleRate);
    const dataSize = numSamples * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    function writeStr(offset: number, str: string) {
      for (let i = 0; i < str.length; i++)
        view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeStr(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, dataSize, true);

    for (let i = 0; i < numSamples; i++) {
      const sample = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.3;
      view.setInt16(44 + i * 2, Math.floor(sample * 32767), true);
    }
    return buffer;
  }

  const lyricsMd = `# Sunny Side Singing
_(SQD 101)_

## Figure
**Heads** promenade halfway\\
Swing and promenade\\
`;

  const MISSING_AUDIO = "BAD 404 - Missing Audio.wav";
  const files = new Map<string, ArrayBuffer | string>();
  files.set("SQD 101 - Sunny Side Singing.wav", generateWav(1, 440));
  files.set("SQD 101 - Sunny Side Singing.md", lyricsMd);
  files.set("RYL 202 - Mountain Morning.wav", generateWav(1, 523));
  files.set("RYL 202 - Mountain Morning.md", lyricsMd);
  files.set("PTR 301 - Steady Groove Patter.wav", generateWav(1, 330));
  if (opts?.missingAudio) {
    files.set(MISSING_AUDIO, generateWav(1, 100));
  }

  function createMockFileHandle(
    filename: string,
    fileMap: Map<string, ArrayBuffer | string>,
  ) {
    return {
      name: filename,
      kind: "file" as const,
      async getFile() {
        if (opts?.missingAudio && filename === MISSING_AUDIO) {
          throw new DOMException(`File not found: ${filename}`, "NotFoundError");
        }
        const content = fileMap.get(filename);
        if (content instanceof ArrayBuffer) {
          return new File([content], filename);
        }
        return new File([content ?? ""], filename);
      },
      async createWritable() {
        let data = "";
        return {
          async write(chunk: string) {
            data += chunk;
          },
          async close() {
            fileMap.set(filename, data);
          },
        };
      },
    };
  }

  function createMockDirHandle(
    dirName: string,
    fileMap: Map<string, ArrayBuffer | string>,
  ) {
    return {
      name: dirName,
      kind: "directory" as const,

      async queryPermission() {
        return "granted";
      },
      async requestPermission() {
        return "granted";
      },
      async isSameEntry(other: { name: string }) {
        return other.name === dirName;
      },

      async *values() {
        for (const [name] of fileMap) {
          yield { name, kind: "file" as const };
        }
      },

      async getFileHandle(
        filename: string,
        options?: { create?: boolean },
      ) {
        if (fileMap.has(filename) || options?.create) {
          return createMockFileHandle(filename, fileMap);
        }
        throw new DOMException(
          `File not found: ${filename}`,
          "NotFoundError",
        );
      },

      async getDirectoryHandle(_name: string) {
        throw new DOMException("Not found", "NotFoundError");
      },
    };
  }

  const mockHandle = createMockDirHandle("TestFolder", files);

  const importFiles = new Map<string, ArrayBuffer | string>();
  importFiles.set("C4 100 - Import Test.wav", generateWav(1, 392));
  importFiles.set(
    "C4 100 - Import Test.md",
    `# Import Test
_(C4 100)_
`,
  );
  const importHandle = createMockDirHandle("ImportTestFolder", importFiles);

  (window as any).showDirectoryPicker = (options?: { id?: string }) => {
    if (options?.id === "callerbuddy-import") {
      return Promise.resolve(importHandle);
    }
    return Promise.resolve(mockHandle);
  };
}

/**
 * Mocks an *empty* CallerBuddyRoot (no files/subfolders), which triggers the
 * "Add demo songs?" offer after the folder is chosen.
 */
function setupEmptyMockFileSystem() {
  const files = new Map<string, ArrayBuffer | string>();

  function createMockFileHandle(
    filename: string,
    fileMap: Map<string, ArrayBuffer | string>,
  ) {
    return {
      name: filename,
      kind: "file" as const,
      async getFile() {
        return new File([fileMap.get(filename) ?? ""], filename);
      },
      async createWritable() {
        let data = "";
        return {
          async write(chunk: string) {
            data += chunk;
          },
          async close() {
            fileMap.set(filename, data);
          },
        };
      },
    };
  }

  const mockHandle = {
    name: "EmptyFolder",
    kind: "directory" as const,
    async queryPermission() {
      return "granted";
    },
    async requestPermission() {
      return "granted";
    },
    async isSameEntry(other: { name: string }) {
      return other.name === "EmptyFolder";
    },
    async *values() {
      for (const [name] of files) {
        yield { name, kind: "file" as const };
      }
    },
    async getFileHandle(filename: string, options?: { create?: boolean }) {
      if (files.has(filename) || options?.create) {
        return createMockFileHandle(filename, files);
      }
      throw new DOMException(`File not found: ${filename}`, "NotFoundError");
    },
    async getDirectoryHandle() {
      throw new DOMException("Not found", "NotFoundError");
    },
  };

  (window as any).showDirectoryPicker = () => Promise.resolve(mockHandle);
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

async function setupPage(page: Page, opts?: { missingAudio?: boolean }) {
  await page.addInitScript(setupMockFileSystem, opts ?? {});
  await page.goto("/");
}

async function setupEmptyFolderPage(page: Page) {
  await page.addInitScript(setupEmptyMockFileSystem);
  await page.goto("/");
}

/** Navigate from welcome screen through folder selection to the editor. */
async function goToEditor(page: Page) {
  await setupPage(page);
  await page
    .locator("welcome-view")
    .getByRole("button", { name: "Open CallerBuddySongs" })
    .click();
  await expect(page.locator("playlist-editor")).toBeVisible();
}

/** From the editor, add all 3 songs to the playlist. */
async function buildPlaylist(page: Page) {
  const addBtns = page.locator("playlist-editor").locator("button.add-btn");
  const count = await addBtns.count();
  for (let i = 0; i < count; i++) {
    await addBtns.nth(i).click();
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("CallerBuddy basic flow", () => {
  test("shows welcome screen on first load", async ({ page }) => {
    await setupPage(page);

    await expect(page.locator("welcome-view")).toBeVisible();
    await expect(
      page
        .locator("welcome-view")
        .getByRole("button", { name: "Instructions to Create CallerBuddySongs Folder" }),
    ).toBeVisible();
    await expect(
      page
        .locator("welcome-view")
        .getByRole("button", { name: "Open CallerBuddySongs" }),
    ).toBeVisible();
  });

  test("Open CallerBuddySongs is focused on load so Enter activates it", async ({
    page,
  }) => {
    await setupPage(page);

    const openBtn = page
      .locator("welcome-view")
      .locator("button.welcome-open");
    await expect(openBtn).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.locator("playlist-editor")).toBeVisible();
  });

  test("Enter activates the focused Open CallerBuddySongs button inside the instructions popup", async ({
    page,
  }) => {
    await setupPage(page);

    await page
      .locator("welcome-view")
      .getByRole("button", { name: "Instructions to Create CallerBuddySongs Folder" })
      .click();

    const modal = page.locator("welcome-view").locator(".instructions-modal");
    await expect(modal).toBeVisible();

    const modalOpenBtn = modal.locator("button.instructions-open");
    await expect(modalOpenBtn).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.locator("playlist-editor")).toBeVisible();
  });

  test("Add demo songs button keeps focus (not stolen by song table) so Enter clicks it", async ({
    page,
  }) => {
    await setupEmptyFolderPage(page);

    await page
      .locator("welcome-view")
      .getByRole("button", { name: "Open CallerBuddySongs" })
      .click();

    const modal = page.locator("app-shell").locator(".demo-offer-modal");
    await expect(modal).toBeVisible();

    const primaryBtn = modal.locator("button.fs-startup-primary");
    // Regression check: loading the (empty) folder used to move focus to the
    // song table after this button was focused, so Enter did nothing.
    await expect(primaryBtn).toBeFocused();

    await page.keyboard.press("Enter");
    // Clicking "Add demo songs" flips the label to "Downloading…" even if the
    // subsequent fetch later fails (no network in this test).
    await expect(primaryBtn).toHaveText(/Downloading/);
  });

  test("new-user instructions popup opens folder via same Open CallerBuddySongs path", async ({
    page,
  }) => {
    await setupPage(page);

    await page
      .locator("welcome-view")
      .getByRole("button", { name: "Instructions to Create CallerBuddySongs Folder" })
      .click();

    const modal = page.locator("welcome-view").locator(".instructions-modal");
    await expect(modal).toBeVisible();
    await expect(modal.locator("img.instructions-img")).toHaveCount(2);

    await modal.getByRole("button", { name: "Open CallerBuddySongs" }).click();
    await expect(page.locator("playlist-editor")).toBeVisible();
  });

  test("loads songs after choosing folder", async ({ page }) => {
    await goToEditor(page);

    const rows = page
      .locator("playlist-editor")
      .locator("table.song-table tbody tr");
    await expect(rows).toHaveCount(3);
  });

  test("displays correct song metadata and types", async ({ page }) => {
    await goToEditor(page);

    const editor = page.locator("playlist-editor");

    // Verify song titles are present
    await expect(editor.locator("td", { hasText: "Mountain Morning" })).toBeVisible();
    await expect(editor.locator("td", { hasText: "Sunny Side Singing" })).toBeVisible();
    await expect(editor.locator("td", { hasText: "Steady Groove Patter" })).toBeVisible();

    // Verify type column: 2 singing calls and 1 patter
    const singingCells = editor.locator(".type-cell .singing");
    const patterCells = editor.locator(".type-cell .patter");
    await expect(singingCells).toHaveCount(2);
    await expect(patterCells).toHaveCount(1);
  });

  test("builds a 3-song playlist", async ({ page }) => {
    await goToEditor(page);
    await buildPlaylist(page);

    const editor = page.locator("playlist-editor");
    const items = editor.locator("ol.playlist-list li.playlist-item");
    await expect(items).toHaveCount(3);

    const playBtn = editor.locator("button.primary", { hasText: "Play" });
    await expect(playBtn).toBeEnabled();
  });

  test("plays a singing call with lyrics", async ({ page }) => {
    await goToEditor(page);
    await buildPlaylist(page);

    // Start playlist playback
    await page
      .locator("playlist-editor")
      .locator("button.primary", { hasText: "Play" })
      .click();
    await expect(page.locator("playlist-play")).toBeVisible();

    // Play the first song (auto-selected)
    await page
      .locator("playlist-play")
      .locator("button.primary", { hasText: "Play" })
      .click();
    await expect(page.locator("song-play")).toBeVisible();

    // Verify lyrics are displayed (singing call)
    await expect(
      page.locator("song-play").locator(".lyrics-content"),
    ).toBeVisible();

    // End the song quickly with Escape
    await page.keyboard.press("Escape");
    await expect(page.locator("song-play")).not.toBeVisible({ timeout: 5000 });

    // Should return to playlist-play
    await expect(page.locator("playlist-play")).toBeVisible();
  });

  test("plays a patter call with loop controls", async ({ page }) => {
    await goToEditor(page);

    // Add only the patter song (identified by its title)
    const editor = page.locator("playlist-editor");
    const patterRow = editor
      .locator("table.song-table tbody tr")
      .filter({ hasText: "Steady Groove Patter" });
    await patterRow.locator("button.add-btn").click();

    // Start playlist playback
    await editor.locator("button.primary", { hasText: "Play" }).click();
    await expect(page.locator("playlist-play")).toBeVisible();

    // Play the patter song
    await page
      .locator("playlist-play")
      .locator("button.primary", { hasText: "Play" })
      .click();
    await expect(page.locator("song-play")).toBeVisible();

    // Verify loop controls are shown (patter, no lyrics)
    await expect(
      page.locator("song-play").locator(".patter-controls"),
    ).toBeVisible();

    // End the song quickly
    await page.keyboard.press("Escape");
    await expect(page.locator("song-play")).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator("playlist-play")).toBeVisible();
  });

  test("shows an error when audio fails to load", async ({ page }) => {
    await setupPage(page, { missingAudio: true });
    await page
      .locator("welcome-view")
      .getByRole("button", { name: "Open CallerBuddySongs" })
      .click();
    await expect(page.locator("playlist-editor")).toBeVisible();

    const editor = page.locator("playlist-editor");
    const missingRow = editor
      .locator("table.song-table tbody tr")
      .filter({ hasText: "Missing Audio" });
    await missingRow.locator("button.add-btn").click();
    await editor.locator("button.primary", { hasText: "Play" }).click();
    await expect(page.locator("playlist-play")).toBeVisible();

    await page
      .locator("playlist-play")
      .locator("button.primary", { hasText: "Play" })
      .click();
    await expect(page.locator("song-play")).not.toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Could not play");
  });

  test("opens song import from folder and can cancel", async ({ page }) => {
    await goToEditor(page);

    await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("menuitem", { name: /Import Song from Folder/ }).click();

    const onboard = page.locator("song-onboard");
    await expect(onboard).toBeVisible();
    await expect(onboard.getByRole("heading", { name: "Import Test" })).toBeVisible();

    await onboard.getByRole("button", { name: "Cancel" }).click();
    await expect(onboard).not.toBeVisible();
  });
});
