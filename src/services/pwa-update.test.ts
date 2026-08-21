import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SKIP_WAITING_MESSAGE,
  bindServiceWorkerUpdates,
  shouldActivateWaitingWorker,
} from "./pwa-update.js";

describe("shouldActivateWaitingWorker", () => {
  const waiting = {} as ServiceWorker;

  it("is false when nothing is waiting", () => {
    expect(shouldActivateWaitingWorker(null, true, true)).toBe(false);
  });

  it("is false on first install (no existing controller)", () => {
    expect(shouldActivateWaitingWorker(waiting, false, true)).toBe(false);
  });

  it("is false while the UI is busy (song open / audio playing)", () => {
    expect(shouldActivateWaitingWorker(waiting, true, false)).toBe(false);
  });

  it("is true for an in-session update while idle", () => {
    expect(shouldActivateWaitingWorker(waiting, true, true)).toBe(true);
  });
});

describe("bindServiceWorkerUpdates", () => {
  let registrationListeners: Record<string, EventListener>;
  let containerListeners: Record<string, EventListener>;
  let waiting: { postMessage: ReturnType<typeof vi.fn> };
  let registration: ServiceWorkerRegistration;
  let serviceWorker: ServiceWorkerContainer;
  let host: { isIdle: ReturnType<typeof vi.fn>; reload: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    registrationListeners = {};
    containerListeners = {};
    waiting = { postMessage: vi.fn() };
    registration = {
      waiting: waiting as unknown as ServiceWorker,
      installing: null,
      addEventListener: vi.fn((type: string, fn: EventListener) => {
        registrationListeners[type] = fn;
      }),
    } as unknown as ServiceWorkerRegistration;
    serviceWorker = {
      controller: {} as ServiceWorker,
      addEventListener: vi.fn((type: string, fn: EventListener) => {
        containerListeners[type] = fn;
      }),
    } as unknown as ServiceWorkerContainer;
    host = {
      isIdle: vi.fn(() => true),
      reload: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("posts skipWaiting immediately when a worker is waiting and the UI is idle", () => {
    bindServiceWorkerUpdates(registration, serviceWorker, host);
    expect(waiting.postMessage).toHaveBeenCalledWith(SKIP_WAITING_MESSAGE);
  });

  it("does not skipWaiting while a song is open; retries after idle", () => {
    host.isIdle.mockReturnValue(false);
    bindServiceWorkerUpdates(registration, serviceWorker, host);
    expect(waiting.postMessage).not.toHaveBeenCalled();

    host.isIdle.mockReturnValue(true);
    vi.advanceTimersByTime(2000);
    expect(waiting.postMessage).toHaveBeenCalledWith(SKIP_WAITING_MESSAGE);
  });

  it("reloads once on controllerchange after we asked the worker to activate", () => {
    bindServiceWorkerUpdates(registration, serviceWorker, host);
    containerListeners.controllerchange(new Event("controllerchange"));
    containerListeners.controllerchange(new Event("controllerchange"));
    expect(host.reload).toHaveBeenCalledOnce();
  });

  it("does not reload on a first-install controllerchange we did not request", () => {
    registration.waiting = null;
    bindServiceWorkerUpdates(registration, serviceWorker, host);
    containerListeners.controllerchange(new Event("controllerchange"));
    expect(host.reload).not.toHaveBeenCalled();
  });
});
