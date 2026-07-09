/**
 * Audio engine: interface and Web Audio API + SoundTouchJS implementation.
 *
 * The interface abstracts audio playback so the pitch/tempo processing backend
 * can be swapped without changing the rest of the app. See BACKLOG.md design
 * decisions for the SoundTouchJS selection rationale.
 *
 * Implementation notes:
 *  - Play/pause/stop/seek/volume: fully functional.
 *  - Pitch shifting: implemented via SoundTouchJS PitchShifter (pitchSemitones).
 *  - Tempo adjustment: implemented via SoundTouchJS PitchShifter (tempo ratio).
 *  - Looping: implemented by monitoring playback position and resetting when
 *    the position reaches the loop end point.
 *
 * The SoundTouchJS PitchShifter wraps a ScriptProcessorNode internally.
 * It reads from the decoded AudioBuffer through the SoundTouch WSOLA
 * (Waveform Similarity Overlap-Add) algorithm, enabling independent control
 * of pitch and tempo. See: https://github.com/cutterbl/SoundTouchJS
 *
 * Design note: ScriptProcessorNode is technically deprecated in favor of
 * AudioWorklet, but remains widely supported. SoundTouchJS also offers an
 * AudioWorklet variant (@soundtouchjs/audio-worklet) that we can migrate to
 * if ScriptProcessorNode support is ever dropped. See BACKLOG.md.
 */

import { PitchShifter } from "soundtouchjs";
import { log } from "./logger.js";
import { WakeLockService } from "./wake-lock.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/** Callback signatures used by the audio engine. */
export type TimeUpdateCallback = (currentTimeSeconds: number) => void;
export type EndedCallback = () => void;

/**
 * Abstract audio engine. Consumers depend on this interface, not the concrete
 * implementation, so the processing backend can be replaced independently.
 */
export interface AudioEngine {
  /** Decode and prepare an audio file for playback. */
  loadAudio(audioData: ArrayBuffer): Promise<void>;

  /** Resume the AudioContext if needed (call `await` this before decode when opening a song from a click). */
  ensureContextRunning(): Promise<void>;

  play(): Promise<void>;
  pause(): void;
  stop(): void;

  /** Seek to an absolute position in seconds. */
  seek(timeSeconds: number): void;

  /** Current playback position in seconds. */
  getCurrentTime(): number;

  /** Total duration of the loaded audio in seconds. */
  getDuration(): number;

  /** Set volume (0 – 100). */
  setVolume(volume: number): void;

  /**
   * Set pitch shift in half-steps (signed integer).
   * Implemented via SoundTouchJS pitchSemitones.
   */
  setPitch(halfSteps: number): void;

  /**
   * Set tempo adjustment.
   *
   * @param deltaBPM  Signed BPM delta (e.g. +5 means "5 BPM faster").
   * @param referenceBPM  The song's original tempo in BPM. When provided
   *   (> 0), the ratio is computed exactly as (reference + delta) / reference.
   *   When omitted or 0, a default of 128 BPM is assumed.
   */
  setTempo(deltaBPM: number, referenceBPM?: number): void;

  /** Configure loop points. Set end = 0 to disable looping. */
  setLoopPoints(startSeconds: number, endSeconds: number): void;

  isPlaying(): boolean;

  /** Register a callback invoked when the song finishes (no loop or loop disabled). */
  onEnded(callback: EndedCallback): void;

  /** Register a callback invoked roughly every animation frame with current time. */
  onTimeUpdate(callback: TimeUpdateCallback): void;

  /** Short alert beep for timers (stronger than {@link playErrorBeep} for audibility over music). */
  playBeep(): void;

  /** Short beep for errors (e.g. no song to play); softer than timer {@link playBeep}. */
  playErrorBeep(): void;

  /** Release all resources. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default reference BPM used to convert a BPM-delta to a tempo ratio.
 * Square dance music is typically 120–130 BPM; 128 is a reasonable midpoint.
 * When the Song model has an originalTempo, that should be used instead.
 */
const DEFAULT_REFERENCE_BPM = 128;

/**
 * ScriptProcessorNode buffer size for SoundTouchJS.  4096 is a good balance
 * between latency (~93 ms at 44.1 kHz) and CPU load.
 */
const SHIFTER_BUFFER_SIZE = 4096;

/**
 * Position/loop polling interval. Using timers instead of requestAnimationFrame
 * keeps time labels and the progress bar updating while the tab is in the
 * background (rAF is throttled or paused there).
 */
const TIME_UPDATE_INTERVAL_MS = 100;

// ---------------------------------------------------------------------------
// Web Audio + SoundTouchJS implementation
// ---------------------------------------------------------------------------

export class WebAudioEngine implements AudioEngine {
  private context: AudioContext;
  private audioBuffer: AudioBuffer | null = null;
  private gainNode: GainNode;

  // --- SoundTouchJS PitchShifter state ---
  private shifter: PitchShifter | null = null;
  private playing = false;
  private connected = false;

  // --- Raw playback state (no pitch/tempo mods) ---
  private sourceNode: AudioBufferSourceNode | null = null;
  /** Context time when raw playback started (used to compute current time). */
  private rawStartContextTime = 0;
  /** Offset into the buffer at which raw playback started. */
  private rawStartOffsetSeconds = 0;

  /** Current pitch shift in half-steps. */
  private pitchHalfSteps = 0;
  /** Current tempo ratio (1.0 = original). */
  private tempoRatio = 1.0;

  // --- Loop state ---
  private loopStart = 0;
  private loopEnd = 0;

  // --- Callbacks ---
  private endedCb: EndedCallback | null = null;
  private timeUpdateCb: TimeUpdateCallback | null = null;
  private timeUpdateIntervalId: ReturnType<typeof setInterval> | null = null;

  // --- Playback tracking ---
  /** The most recent time (seconds) reported by the PitchShifter. */
  private lastReportedTime = 0;
  /** Whether we have already fired the ended callback for the current playback. */
  private endedFired = false;

  private wakeLock = new WakeLockService();

  /** When returning to the tab, resume a browser-suspended context (important when auto-pause-on-blur is off). */
  private readonly onDocumentVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      void this.ensureContextRunning();
    }
  };

  constructor() {
    this.context = new AudioContext();
    this.gainNode = this.context.createGain();
    this.gainNode.connect(this.context.destination);
    document.addEventListener("visibilitychange", this.onDocumentVisibilityChange);
  }

  async loadAudio(audioData: ArrayBuffer): Promise<void> {
    this.stop();
    const t0 = performance.now();
    this.audioBuffer = await this.context.decodeAudioData(audioData);
    const t1 = performance.now();
    this.lastReportedTime = 0;
    this.endedFired = false;
    log.info(
      `Audio loaded: ${this.audioBuffer.duration.toFixed(1)}s, ` +
        `${this.audioBuffer.numberOfChannels}ch, ${this.audioBuffer.sampleRate}Hz`,
    );
    log.info(`Audio decode: ${(t1 - t0).toFixed(1)}ms`);
  }

  async ensureContextRunning(): Promise<void> {
    if (this.context.state === "suspended") {
      try {
        await this.context.resume();
      } catch (err) {
        log.warn("AudioContext.resume() failed:", err);
      }
    }
  }

  async play(): Promise<void> {
    if (this.playing || !this.audioBuffer) return;
    if (this.context.state === "suspended") {
      await this.context.resume();
    }

    // If no pitch/tempo modifications are requested, avoid SoundTouchJS overhead.
    if (this.canUseRawPlayback()) {
      this.startRawPlayback();
    } else {
      // If we don't have a PitchShifter yet, create one
      if (!this.shifter) {
        this.createShifter();
      }

      // Connect the shifter to the gain node to start audio flowing
      if (this.shifter && !this.connected) {
        this.shifter.connect(this.gainNode);
        this.connected = true;
      }
    }

    this.playing = true;
    this.endedFired = false;
    this.startTimeUpdates();
    void this.wakeLock.acquire();
  }

  pause(): void {
    if (!this.playing) return;
    // Disconnect stops audio flow but keeps the shifter's position
    if (this.shifter && this.connected) {
      this.shifter.disconnect();
      this.connected = false;
    }
    if (this.sourceNode) {
      // Stopping the source is the only way to pause; remember current position.
      this.lastReportedTime = this.getCurrentTime();
      try {
        this.sourceNode.onended = null;
        this.sourceNode.stop();
      } catch {
        // ignore
      }
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }
    this.playing = false;
    this.stopTimeUpdates();
    void this.wakeLock.release();
  }

  stop(): void {
    if (this.shifter && this.connected) {
      this.shifter.disconnect();
      this.connected = false;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.onended = null;
        this.sourceNode.stop();
      } catch {
        // ignore
      }
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }
    this.destroyShifter();
    this.lastReportedTime = 0;
    this.playing = false;
    this.endedFired = false;
    this.stopTimeUpdates();
    void this.wakeLock.release();
  }

  seek(timeSeconds: number): void {
    const duration = this.getDuration();
    const clampedTime = Math.max(0, Math.min(timeSeconds, duration));

    if (this.shifter && duration > 0) {
      // PitchShifter.percentagePlayed setter expects 0–1 fraction
      const fraction = clampedTime / duration;
      this.shifter.percentagePlayed = fraction;
      this.lastReportedTime = clampedTime;
      // Read-back uses getter which returns 0–100 (asymmetric API)
      const readBackPct = this.shifter.percentagePlayed;
      log.info(
        `seek: time=${clampedTime.toFixed(2)}s, duration=${duration.toFixed(2)}s, ` +
          `set fraction=${fraction.toFixed(4)}, readBackPct=${readBackPct.toFixed(4)}`,
      );
    } else {
      this.lastReportedTime = clampedTime;
    }

    // Raw mode: restart source at the desired offset when playing.
    if (!this.shifter && this.playing) {
      if (this.sourceNode) {
        try {
          this.sourceNode.onended = null;
          this.sourceNode.stop();
        } catch {
          // ignore
        }
        try {
          this.sourceNode.disconnect();
        } catch {
          // ignore
        }
        this.sourceNode = null;
      }
      if (this.canUseRawPlayback()) {
        this.startRawPlayback(clampedTime);
      }
    }

    // If we're playing but had to recreate the shifter, reconnect
    if (this.playing && this.shifter && !this.connected) {
      this.shifter.connect(this.gainNode);
      this.connected = true;
    }
  }

  getCurrentTime(): number {
    if (this.sourceNode && this.playing) {
      const elapsed = this.context.currentTime - this.rawStartContextTime;
      const absolute = Math.max(0, this.rawStartOffsetSeconds + elapsed);
      return this.wrapLoopPosition(absolute, this.rawStartOffsetSeconds, elapsed);
    }
    return this.lastReportedTime;
  }

  getDuration(): number {
    return this.audioBuffer?.duration ?? 0;
  }

  setVolume(volume: number): void {
    // volume is 0-100 → gain is 0-1
    this.gainNode.gain.value = Math.max(0, Math.min(volume, 100)) / 100;
  }

  setPitch(halfSteps: number): void {
    this.pitchHalfSteps = halfSteps;
    // If we're playing raw and pitch is changed, switch to shifter.
    if (this.playing && this.sourceNode && !this.canUseRawPlayback()) {
      this.switchRawToShifterAtCurrentTime();
    }
    if (this.shifter) {
      this.shifter.pitchSemitones = halfSteps;
    }
    log.info(`setPitch(${halfSteps}) — pitch shift set to ${halfSteps} half-steps`);
  }

  setTempo(deltaBPM: number, referenceBPM?: number): void {
    const ref = referenceBPM && referenceBPM > 0 ? referenceBPM : DEFAULT_REFERENCE_BPM;
    // Convert BPM delta to a ratio: ratio = (ref + delta) / ref
    // e.g. +5 BPM at 128 reference = 133/128 = 1.039 (3.9% faster)
    this.tempoRatio = (ref + deltaBPM) / ref;
    // Clamp to reasonable range (0.5x to 2.0x)
    this.tempoRatio = Math.max(0.5, Math.min(2.0, this.tempoRatio));

    // If we're playing raw and tempo is changed, switch to shifter.
    if (this.playing && this.sourceNode && !this.canUseRawPlayback()) {
      this.switchRawToShifterAtCurrentTime();
    }
    if (this.shifter) {
      this.shifter.tempo = this.tempoRatio;
    }
    log.info(
      `setTempo(${deltaBPM}, ref=${ref}) — tempo ratio ${this.tempoRatio.toFixed(3)} ` +
        `(${deltaBPM >= 0 ? "+" : ""}${deltaBPM} BPM from ${ref} BPM)`,
    );
  }

  setLoopPoints(startSeconds: number, endSeconds: number): void {
    let start = startSeconds;
    const end = endSeconds;
    // Require start < end when looping is on (end > 0); allow both 0 = disabled
    if (end > 0 && start >= end) {
      start = Math.max(0, end - 0.001);
    }
    this.loopStart = start;
    this.loopEnd = end;
    log.info(
      `setLoopPoints(${start.toFixed(2)}, ${end.toFixed(2)}) — ` +
        (end > 0 ? "looping enabled" : "looping disabled"),
    );
    if (this.sourceNode) {
      this.sourceNode.loop = end > 0 && end > start;
      if (this.sourceNode.loop) {
        this.sourceNode.loopStart = start;
        this.sourceNode.loopEnd = end;
      }
    }
  }

  isPlaying(): boolean {
    return this.playing;
  }

  onEnded(callback: EndedCallback): void {
    this.endedCb = callback;
  }

  onTimeUpdate(callback: TimeUpdateCallback): void {
    this.timeUpdateCb = callback;
  }

  /** Play a short beep using an oscillator (for timer alerts). Louder/longer than {@link playErrorBeep} so it cuts through music. */
  playBeep(): void {
    this.playTone(880, 1.0, 2.0);  // 1.0 second, 2.0 gain
  }

  /** Play a short beep for errors (e.g. no song to play). Uses a softer profile than timer beeps. */
  playErrorBeep(): void {
    this.playTone(880, 0.5, 0.15);
  }

  private playTone(
    frequencyHz: number,
    durationSeconds: number,
    peakGain = 0.15,
  ): void {
    const osc = this.context.createOscillator();
    const g = this.context.createGain();
    osc.type = "sine";
    osc.frequency.value = frequencyHz;
    g.gain.setValueAtTime(peakGain, this.context.currentTime);
    g.gain.exponentialRampToValueAtTime(
      0.001,
      this.context.currentTime + durationSeconds,
    );
    osc.connect(g).connect(this.context.destination);
    osc.start();
    osc.stop(this.context.currentTime + durationSeconds);
  }

  dispose(): void {
    document.removeEventListener("visibilitychange", this.onDocumentVisibilityChange);
    this.stop();
    this.wakeLock.dispose();
    this.context.close();
  }

  // -- private helpers ------------------------------------------------------

  /**
   * Create a new PitchShifter from the current audioBuffer, applying the
   * current pitch and tempo settings.
   */
  private createShifter(): void {
    if (!this.audioBuffer) return;

    this.destroyShifter();

    const t0 = performance.now();
    this.shifter = new PitchShifter(
      this.context,
      this.audioBuffer,
      SHIFTER_BUFFER_SIZE,
      () => this.onShifterEnd(),
    );

    // Apply current pitch and tempo settings
    this.shifter.pitchSemitones = this.pitchHalfSteps;
    this.shifter.tempo = this.tempoRatio;

    // Note: we do NOT use the "play" event for position tracking because
    // the ScriptProcessorNode can emit stale timePlayed values after a seek.
    // Instead, we read the shifter's percentagePlayed getter directly in the
    // RAF loop (see startTimeUpdates), making the shifter's internal
    // sourcePosition the single source of truth for playback position.

    // If we had a saved position, seek to it (setter expects 0–1 fraction)
    if (this.lastReportedTime > 0 && this.getDuration() > 0) {
      const fraction = this.lastReportedTime / this.getDuration();
      this.shifter.percentagePlayed = fraction;
    }

    const t1 = performance.now();
    log.info(`SoundTouchJS PitchShifter created in ${(t1 - t0).toFixed(1)}ms`);
  }

  /** Called by SoundTouchJS when the source buffer is exhausted. */
  private onShifterEnd(): void {
    if (this.endedFired) return;

    // If looping is active, seek to loop start instead of ending
    if (this.loopEnd > 0 && this.loopEnd > this.loopStart) {
      this.seek(this.loopStart);
      return;
    }

    this.endedFired = true;
    this.playing = false;
    this.stopTimeUpdates();
    this.endedCb?.();
  }

  private destroyShifter(): void {
    if (this.shifter) {
      try {
        this.shifter.off();
        if (this.connected) {
          this.shifter.disconnect();
          this.connected = false;
        }
      } catch {
        // Shifter may already be disconnected
      }
      this.shifter = null;
    }
  }

  /** Last time we logged position (for throttling). */
  private lastPositionLogTime = 0;

  private startTimeUpdates(): void {
    this.stopTimeUpdates();
    const tick = () => {
      if (this.playing) {
        if (this.shifter) {
          // Read current position directly from the shifter's internal state.
          // NOTE: SoundTouchJS has an asymmetric API:
          //   - setter expects a 0–1 fraction (see seek())
          //   - getter returns a 0–100 percentage
          // So we divide by 100 here to convert to a fraction, then multiply by
          // duration to get seconds.
          const duration = this.getDuration();
          if (duration > 0) {
            const pctRaw = this.shifter.percentagePlayed; // 0–100
            this.lastReportedTime = (pctRaw / 100) * duration;

            // Throttled position log (about once per second)
            const now = Date.now();
            if (now - this.lastPositionLogTime >= 1000) {
              this.lastPositionLogTime = now;
              log.info(
                `position: pctRaw=${pctRaw.toFixed(4)}, time=${this.lastReportedTime.toFixed(2)}s, duration=${duration.toFixed(2)}s`,
              );
            }
          }

          // Check loop points
          if (
            this.loopEnd > 0 &&
            this.loopEnd > this.loopStart &&
            this.lastReportedTime >= this.loopEnd
          ) {
            this.seek(this.loopStart);
          }
        } else if (this.sourceNode) {
          this.lastReportedTime = this.getCurrentTime();
        }
      }

      this.timeUpdateCb?.(this.lastReportedTime);
    };
    tick();
    this.timeUpdateIntervalId = window.setInterval(tick, TIME_UPDATE_INTERVAL_MS);
  }

  private canUseRawPlayback(): boolean {
    return this.pitchHalfSteps === 0 && Math.abs(this.tempoRatio - 1.0) < 1e-6;
  }

  /**
   * Map monotonic elapsed playback time to the current position within the
   * loop region. Raw AudioBufferSourceNode looping is handled by the browser;
   * this keeps UI position and the progress bar in sync with what you hear.
   */
  private wrapLoopPosition(
    absoluteSeconds: number,
    startOffsetSeconds: number,
    elapsedSeconds: number,
  ): number {
    if (this.loopEnd <= 0 || this.loopEnd <= this.loopStart) {
      return absoluteSeconds;
    }
    const loopLen = this.loopEnd - this.loopStart;
    const offsetInLoop = startOffsetSeconds - this.loopStart;
    const positionInLoop =
      (((offsetInLoop + elapsedSeconds) % loopLen) + loopLen) % loopLen;
    return this.loopStart + positionInLoop;
  }

  private startRawPlayback(offsetSeconds?: number): void {
    if (!this.audioBuffer) return;
    const offset = offsetSeconds ?? this.lastReportedTime;
    const clamped = Math.max(0, Math.min(offset, this.audioBuffer.duration));

    // Ensure any shifter path is down before starting raw playback.
    if (this.shifter && this.connected) {
      try {
        this.shifter.disconnect();
      } catch {
        // ignore
      }
      this.connected = false;
    }
    this.destroyShifter();

    if (this.sourceNode) {
      try {
        this.sourceNode.onended = null;
        this.sourceNode.stop();
      } catch {
        // ignore
      }
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }

    const t0 = performance.now();
    const src = this.context.createBufferSource();
    src.buffer = this.audioBuffer;
    src.connect(this.gainNode);

    src.loop = this.loopEnd > 0 && this.loopEnd > this.loopStart;
    if (src.loop) {
      src.loopStart = this.loopStart;
      src.loopEnd = this.loopEnd;
    }

    src.onended = () => {
      if (!this.playing || this.sourceNode !== src) return;
      if (this.endedFired) return;
      if (this.loopEnd > 0 && this.loopEnd > this.loopStart) return;
      this.endedFired = true;
      this.playing = false;
      this.stopTimeUpdates();
      this.endedCb?.();
    };

    this.sourceNode = src;
    this.rawStartOffsetSeconds = clamped;
    this.rawStartContextTime = this.context.currentTime;
    this.lastReportedTime = clamped;

    try {
      src.start(0, clamped);
    } catch (err) {
      log.warn("Raw playback source.start failed:", err);
    }

    const t1 = performance.now();
    log.info(
      `Audio play (raw): started in ${(t1 - t0).toFixed(1)}ms at ${clamped.toFixed(2)}s`,
    );
  }

  private switchRawToShifterAtCurrentTime(): void {
    const t = this.getCurrentTime();
    if (this.sourceNode) {
      try {
        this.sourceNode.onended = null;
        this.sourceNode.stop();
      } catch {
        // ignore
      }
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }
    this.lastReportedTime = t;
    this.createShifter();
    if (this.shifter && !this.connected) {
      this.shifter.connect(this.gainNode);
      this.connected = true;
    }
    log.info(`Audio mode switch: raw → shifter at ${t.toFixed(2)}s`);
  }

  private stopTimeUpdates(): void {
    if (this.timeUpdateIntervalId !== null) {
      window.clearInterval(this.timeUpdateIntervalId);
      this.timeUpdateIntervalId = null;
    }
  }
}
