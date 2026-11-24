import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resetCallerBuddyBrowserState,
  resetNavigation,
} from "./file-system-service.js";

type FireMode = "success" | "blocked";

function installIndexedDb(
  mode: FireMode,
  databases: Array<{ name?: string }> = [],
) {
  const deleteDatabase = vi.fn(() => {
    const req = {
      onsuccess: null as ((ev: Event) => void) | null,
      onerror: null as ((ev: Event) => void) | null,
      onblocked: null as ((ev: Event) => void) | null,
      error: null as DOMException | null,
    };
    queueMicrotask(() => {
      if (mode === "success") req.onsuccess?.(new Event("success"));
      else req.onblocked?.(new Event("blocked"));
    });
    return req;
  });
  vi.stubGlobal("indexedDB", {
    deleteDatabase,
    databases: vi.fn(async () => databases),
    open: vi.fn(),
  });
  return deleteDatabase;
}

function mockReload() {
  const reload = vi.fn();
  vi.spyOn(resetNavigation, "reload").mockImplementation(reload);
  return reload;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("resetCallerBuddyBrowserState", () => {
  it("reloads when queryPermission never returns, without reading the folder", async () => {
    vi.useFakeTimers();
    const deleteDatabase = installIndexedDb("success");
    const reload = mockReload();
    const handle = {
      name: "CallerBuddySongs",
      queryPermission: () => new Promise<PermissionState>(() => {}),
      requestPermission: vi.fn(),
      getFileHandle: vi.fn(() => {
        throw new Error("folder should not be read when permission does not answer");
      }),
      removeEntry: vi.fn(),
    };

    const pending = resetCallerBuddyBrowserState(
      handle as unknown as FileSystemDirectoryHandle,
    );
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe("reloaded");

    expect(deleteDatabase).toHaveBeenCalledWith("callerbuddy");
    expect(reload).toHaveBeenCalledOnce();
    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(handle.getFileHandle).not.toHaveBeenCalled();
    expect(handle.removeEntry).not.toHaveBeenCalled();
  });

  it("returns needs-manual and does not reload when deleteDatabase stays blocked", async () => {
    vi.useFakeTimers();
    installIndexedDb("blocked", [{ name: "callerbuddy" }]);
    const reload = mockReload();
    const handle = {
      name: "CallerBuddySongs",
      queryPermission: async () => "prompt" as PermissionState,
      requestPermission: vi.fn(),
      getFileHandle: vi.fn(),
      removeEntry: vi.fn(),
    };

    const pending = resetCallerBuddyBrowserState(
      handle as unknown as FileSystemDirectoryHandle,
    );
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe("needs-manual");

    expect(reload).not.toHaveBeenCalled();
    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(handle.getFileHandle).not.toHaveBeenCalled();
  });

  it("deletes CallerBuddySettings.json before reload when permission is already granted", async () => {
    const deleteDatabase = installIndexedDb("success");
    const order: string[] = [];
    const reload = vi.fn(() => {
      order.push("reload");
    });
    vi.spyOn(resetNavigation, "reload").mockImplementation(reload);
    const handle = {
      name: "CallerBuddySongs",
      queryPermission: async () => "granted" as PermissionState,
      requestPermission: vi.fn(),
      getFileHandle: vi.fn(async () => ({})),
      removeEntry: vi.fn(async (name: string) => {
        order.push(`remove:${name}`);
      }),
    };

    const result = await resetCallerBuddyBrowserState(
      handle as unknown as FileSystemDirectoryHandle,
    );

    expect(result).toBe("reloaded");
    expect(deleteDatabase).toHaveBeenCalledWith("callerbuddy");
    expect(handle.requestPermission).not.toHaveBeenCalled();
    expect(order).toEqual(["remove:CallerBuddySettings.json", "reload"]);
  });
});
