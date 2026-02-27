import { describe, it, expect, vi, afterEach } from "vitest";
import { formatTime, formatCountdown, formatClock } from "./format.js";

describe("formatTime", () => {
  it("formats zero seconds", () => {
    expect(formatTime(0)).toBe("0:00");
  });

  it("formats seconds under a minute", () => {
    expect(formatTime(5)).toBe("0:05");
    expect(formatTime(59)).toBe("0:59");
  });

  it("formats exact minutes", () => {
    expect(formatTime(60)).toBe("1:00");
    expect(formatTime(120)).toBe("2:00");
  });

  it("formats minutes and seconds", () => {
    expect(formatTime(90)).toBe("1:30");
    expect(formatTime(185)).toBe("3:05");
  });

  it("truncates fractional seconds (floor)", () => {
    expect(formatTime(59.9)).toBe("0:59");
    expect(formatTime(60.999)).toBe("1:00");
  });

  it("formats large values", () => {
    expect(formatTime(3661)).toBe("61:01");
  });

  it("treats negative values as their absolute value", () => {
    expect(formatTime(-90)).toBe("1:30");
  });
});

describe("formatCountdown", () => {
  it("formats zero", () => {
    expect(formatCountdown(0)).toBe("0:00");
  });

  it("formats positive values without sign", () => {
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(300)).toBe("5:00");
  });

  it("formats negative values with minus sign", () => {
    expect(formatCountdown(-10)).toBe("-0:10");
    expect(formatCountdown(-125)).toBe("-2:05");
  });
});

describe("formatClock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a string matching HH:MM pattern", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 14, 30, 0));
    const result = formatClock();
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});
