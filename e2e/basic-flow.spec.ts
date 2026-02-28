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
function setupMockFileSystem() {
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

  const lyricsHtml = `<!DOCTYPE html><html><body>
    <h1>Test Lyrics</h1>
    <p class="verse">Circle left and walk around the ring</p>
  </body></html>`;

  const files = new Map<string, ArrayBuffer | string>();
  files.set("SQD 101 - Sunny Side Singing.wav", generateWav(1, 440));
  files.set("SQD 101 - Sunny Side Singing.html", lyricsHtml);
  files.set("RYL 202 - Mountain Morning.wav", generateWav(1, 523));
  files.set("RYL 202 - Mountain Morning.html", lyricsHtml);
  files.set("PTR 301 - Steady Groove Patter.wav", generateWav(1, 330));

  function createMockFileHandle(
    filename: string,
    fileMap: Map<string, ArrayBuffer | string>,
  ) {
    return {
      name: filename,
      kind: "file" as const,
      async getFile() {
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

  const mockHandle = {
    name: "TestFolder",
    kind: "directory" as const,

    async queryPermission() {
      return "granted";
    },
    async requestPermission() {
      return "granted";
    },
    async isSameEntry(other: { name: string }) {
      return other.name === "TestFolder";
    },

    async *values() {
      for (const [name] of files) {
        yield { name, kind: "file" as const };
      }
    },

    async getFileHandle(
      filename: string,
      options?: { create?: boolean },
    ) {
      if (files.has(filename) || options?.create) {
        return createMockFileHandle(filename, files);
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

  (window as any).showDirectoryPicker = () => Promise.resolve(mockHandle);
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

async function setupPage(page: Page) {
  await page.addInitScript(setupMockFileSystem);
  await page.goto("/");
}

/** Navigate from welcome screen through folder selection to the editor. */
async function goToEditor(page: Page) {
  await setupPage(page);
  await page
    .locator("welcome-view")
    .locator("button.primary")
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
    const btn = page.locator("welcome-view").locator("button.primary");
    await expect(btn).toBeVisible();
    await expect(btn).toContainText("Choose CallerBuddy folder");
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
});
