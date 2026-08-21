import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { ReactiveControllerHost } from "lit";
import {
  COUNTDOWN_ALARM_REPEAT_MS,
  CountdownAlarmController,
} from "./countdown-alarm-controller.js";

function fakeHost(): ReactiveControllerHost {
  return {
    addController() {},
    removeController() {},
    requestUpdate() {},
    updateComplete: Promise.resolve(true),
  };
}

describe("CountdownAlarmController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ticks down once per second", () => {
    const c = new CountdownAlarmController(fakeHost(), { playBeep: vi.fn() });
    c.setDurationSeconds(5);
    c.start();
    expect(c.countdown).toBe(5);
    expect(c.running).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(c.countdown).toBe(4);
    vi.advanceTimersByTime(2000);
    expect(c.countdown).toBe(2);
  });

  it("beeps at zero and every 30 seconds while overtime", () => {
    const playBeep = vi.fn();
    const c = new CountdownAlarmController(fakeHost(), { playBeep });
    c.setDurationSeconds(2);
    c.start();

    vi.advanceTimersByTime(1000);
    expect(playBeep).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(c.countdown).toBe(0);
    expect(playBeep).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(COUNTDOWN_ALARM_REPEAT_MS - 1);
    expect(playBeep).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(playBeep).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(COUNTDOWN_ALARM_REPEAT_MS);
    expect(playBeep).toHaveBeenCalledTimes(3);
  });

  it("does not beep at zero when disabled", () => {
    const playBeep = vi.fn();
    const c = new CountdownAlarmController(fakeHost(), { playBeep });
    c.setDurationSeconds(1);
    c.setEnabled(false);
    c.start();
    vi.advanceTimersByTime(1000);
    expect(c.countdown).toBe(0);
    expect(playBeep).not.toHaveBeenCalled();
  });

  it("stops the repeating alarm when disabled, and resumes it when re-enabled overtime", () => {
    const playBeep = vi.fn();
    const c = new CountdownAlarmController(fakeHost(), { playBeep });
    c.setDurationSeconds(1);
    c.start();
    vi.advanceTimersByTime(1000);
    expect(playBeep).toHaveBeenCalledTimes(1);

    c.setEnabled(false);
    vi.advanceTimersByTime(COUNTDOWN_ALARM_REPEAT_MS);
    expect(playBeep).toHaveBeenCalledTimes(1);

    c.setEnabled(true);
    expect(playBeep).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(COUNTDOWN_ALARM_REPEAT_MS);
    expect(playBeep).toHaveBeenCalledTimes(3);
  });

  it("pause keeps remaining time; resume continues ticking", () => {
    const c = new CountdownAlarmController(fakeHost(), { playBeep: vi.fn() });
    c.setDurationSeconds(5);
    c.start();
    vi.advanceTimersByTime(2000);
    expect(c.countdown).toBe(3);

    c.pause();
    expect(c.running).toBe(true);
    expect(c.ticking).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(c.countdown).toBe(3);

    c.resume();
    vi.advanceTimersByTime(1000);
    expect(c.countdown).toBe(2);
  });

  it("reset clears running state and restores the duration", () => {
    const playBeep = vi.fn();
    const c = new CountdownAlarmController(fakeHost(), { playBeep });
    c.setDurationSeconds(3);
    c.start();
    vi.advanceTimersByTime(3000);
    expect(playBeep).toHaveBeenCalled();

    c.reset();
    expect(c.running).toBe(false);
    expect(c.countdown).toBe(3);
    vi.advanceTimersByTime(COUNTDOWN_ALARM_REPEAT_MS);
    expect(playBeep).toHaveBeenCalledTimes(1);
  });

  it("stops repeating beeps after the alarm cap", () => {
    const playBeep = vi.fn();
    const c = new CountdownAlarmController(fakeHost(), {
      playBeep,
      alarmCapMs: () => 60_000,
    });
    c.setDurationSeconds(1);
    c.start();
    vi.advanceTimersByTime(1000);
    expect(playBeep).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(COUNTDOWN_ALARM_REPEAT_MS);
    expect(playBeep).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(60_000);
    const afterCap = playBeep.mock.calls.length;
    vi.advanceTimersByTime(COUNTDOWN_ALARM_REPEAT_MS * 2);
    expect(playBeep).toHaveBeenCalledTimes(afterCap);
  });
});
