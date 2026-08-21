/**
 * Shared countdown + repeating-beep alarm used by the patter timer (song-play)
 * and the break timer (playlist-play).
 *
 * Hosts keep their own UI and policies (play-synced vs blur-pause, wake lock).
 */

import type { ReactiveController, ReactiveControllerHost } from "lit";

export const COUNTDOWN_ALARM_REPEAT_MS = 30_000;

export interface CountdownAlarmOptions {
  playBeep: () => void;
  /** Interval between beeps after zero. Default 30s. */
  alarmRepeatMs?: number;
  /**
   * If set, stop repeating beeps this many ms after the first beep
   * (break timer caps at the break length so it cannot run forever).
   */
  alarmCapMs?: () => number;
}

export class CountdownAlarmController implements ReactiveController {
  host: ReactiveControllerHost;

  countdown = 0;
  running = false;
  enabled = true;
  durationSeconds = 0;

  private tickId: number | null = null;
  private alarmId: number | null = null;
  private alarmCapId: number | null = null;
  private alarmStarted = false;
  private playBeep: () => void;
  private alarmRepeatMs: number;
  private alarmCapMs?: () => number;

  constructor(host: ReactiveControllerHost, opts: CountdownAlarmOptions) {
    this.host = host;
    this.playBeep = opts.playBeep;
    this.alarmRepeatMs = opts.alarmRepeatMs ?? COUNTDOWN_ALARM_REPEAT_MS;
    this.alarmCapMs = opts.alarmCapMs;
    host.addController(this);
  }

  hostConnected(): void {}

  hostDisconnected(): void {
    this.stop();
  }

  /** True while the 1s tick interval is active. */
  get ticking(): boolean {
    return this.tickId !== null;
  }

  setDurationSeconds(seconds: number): void {
    this.durationSeconds = Math.max(0, seconds);
    this.host.requestUpdate();
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.stopAlarm();
    } else if (this.running && this.countdown <= 0 && this.alarmStarted) {
      this.startAlarm();
    }
    this.host.requestUpdate();
  }

  /** Set countdown from duration, mark running, and start ticking. */
  start(): void {
    this.stopAlarm();
    this.clearTick();
    this.countdown = this.durationSeconds;
    this.running = true;
    this.alarmStarted = false;
    this.startTick();
    this.host.requestUpdate();
  }

  /** Stop ticking and alarm; leave countdown as-is. */
  stop(): void {
    this.running = false;
    this.clearTick();
    this.stopAlarm();
    this.host.requestUpdate();
  }

  /** Reset countdown to duration and clear running/alarm (does not start). */
  reset(): void {
    this.countdown = this.durationSeconds;
    this.running = false;
    this.alarmStarted = false;
    this.clearTick();
    this.stopAlarm();
    this.host.requestUpdate();
  }

  /** Pause tick and alarm; keep remaining time and running flag. */
  pause(): void {
    this.clearTick();
    this.stopAlarm();
    this.host.requestUpdate();
  }

  /** Resume ticking if still running. */
  resume(): void {
    if (!this.running || this.tickId !== null) return;
    this.startTick();
  }

  private startTick(): void {
    if (this.tickId !== null) return;
    this.tickId = window.setInterval(() => this.onTick(), 1000);
  }

  private onTick(): void {
    this.countdown--;
    if (this.countdown === 0 && !this.alarmStarted) {
      this.alarmStarted = true;
      if (this.enabled) this.startAlarm();
    }
    this.host.requestUpdate();
  }

  private startAlarm(): void {
    if (!this.enabled) return;
    this.stopAlarm();
    this.playBeep();
    this.alarmId = window.setInterval(() => {
      this.playBeep();
    }, this.alarmRepeatMs);
    const capMs = this.alarmCapMs?.();
    if (capMs != null) {
      this.alarmCapId = window.setTimeout(() => {
        this.alarmCapId = null;
        this.stopAlarm();
      }, capMs);
    }
  }

  private stopAlarm(): void {
    if (this.alarmId !== null) {
      clearInterval(this.alarmId);
      this.alarmId = null;
    }
    if (this.alarmCapId !== null) {
      clearTimeout(this.alarmCapId);
      this.alarmCapId = null;
    }
  }

  private clearTick(): void {
    if (this.tickId !== null) {
      clearInterval(this.tickId);
      this.tickId = null;
    }
  }
}
