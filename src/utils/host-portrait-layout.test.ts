// @vitest-environment jsdom

import { describe, expect, it, vi, afterEach } from "vitest";
import {
  PORTRAIT_LAYOUT_ASPECT,
  isHostPortraitLayout,
} from "./host-portrait-layout.js";

function mockRect(el: Element, width: number, height: number) {
  vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
    width,
    height,
    top: 0,
    left: 0,
    bottom: height,
    right: width,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

describe("isHostPortraitLayout", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses host aspect when box is measurable", () => {
    const el = document.createElement("div");
    mockRect(el, 400, 800);
    expect(isHostPortraitLayout(el)).toBe(true);

    mockRect(el, 800, 400);
    expect(isHostPortraitLayout(el)).toBe(false);
  });

  it("stacks at exactly 6/5", () => {
    const el = document.createElement("div");
    mockRect(el, 600, 500); // 1.2
    expect(600 / 500).toBe(PORTRAIT_LAYOUT_ASPECT);
    expect(isHostPortraitLayout(el)).toBe(true);

    mockRect(el, 601, 500); // > 1.2
    expect(isHostPortraitLayout(el)).toBe(false);
  });

  it("falls back to matchMedia when host box is tiny", () => {
    const el = document.createElement("div");
    mockRect(el, 0, 0);
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: "(max-aspect-ratio: 6/5)",
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as typeof window.matchMedia;
    expect(isHostPortraitLayout(el)).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith("(max-aspect-ratio: 6/5)");
  });
});
