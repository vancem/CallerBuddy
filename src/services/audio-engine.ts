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

  play(): void;
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
   * Set tempo adjustment as a ratio.
   *
   * The caller provides a **BPM delta** (e.g. +5 means "5 BPM faster").
   * Since the original BPM of the song may not be known, we approximate
   * the tempo ratio as: ratio = 1 + deltaBPM / referenceBPM, where
   * referenceBPM defaults to 128 (a typical square dance tempo). When
   * originalTempo is available on the Song model, the caller should pass
   * that for higher accuracy.
   */
  setTempo(deltaBPM: number): void;

  /** Configure loop points. Set end = 0 to disable looping. */
  setLoopPoints(startSeconds: number, endSeconds: number): void;

  isPlaying(): boolean;

  /** Register a callback invoked when the song finishes (no loop or loop disabled). */
  onEnded(callback: EndedCallback): void;

  /** Register a callback invoked roughly every animation frame with current time. */
  onTimeUpdate(callback: TimeUpdateCallback): void;

  /** Play a short alert beep (for timers). */
  playBeep(): void;

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
  private rafId: number | null = null;

  // --- Playback tracking ---
  /** The most recent time (seconds) reported by the PitchShifter. */
  private lastReportedTime = 0;
  /** Whether we have already fired the ended callback for the current playback. */
  private endedFired = false;

  constructor() {
    this.context = new AudioContext();
    this.gainNode = this.context.createGain();
    this.gainNode.connect(this.context.destination);
  }

  async loadAudio(audioData: ArrayBuffer): Promise<void> {
    this.stop();
    this.audioBuffer = await this.context.decodeAudioData(audioData);
    this.lastReportedTime = 0;
    this.endedFired = false;
    log.info(
      `Audio loaded: ${this.audioBuffer.duration.toFixed(1)}s, ` +
        `${this.audioBuffer.numberOfChannels}ch, ${this.audioBuffer.sampleRate}Hz`,
    );
  }

  play(): void {
    if (this.playing || !this.audioBuffer) return;
    if (this.context.state === "suspended") {
      this.context.resume();
    }

    // If we don't have a PitchShifter yet, create one
    if (!this.shifter) {
      this.createShifter();
    }

    // Connect the shifter to the gain node to start audio flowing
    if (this.shifter && !this.connected) {
      this.shifter.connect(this.gainNode);
      this.connected = true;
    }

    this.playing = true;
    this.endedFired = false;
    this.startTimeUpdates();
  }

  pause(): void {
    if (!this.playing) return;
    // Disconnect stops audio flow but keeps the shifter's position
    if (this.shifter && this.connected) {
      this.shifter.disconnect();
      this.connected = false;
    }
    this.playing = false;
    this.stopTimeUpdates();
  }

  stop(): void {
    if (this.shifter && this.connected) {
      this.shifter.disconnect();
      this.connected = false;
    }
    this.destroyShifter();
    this.lastReportedTime = 0;
    this.playing = false;
    this.endedFired = false;
    this.stopTimeUpdates();
  }

  seek(timeSeconds: number): void {
    const duration = this.getDuration();
    const clampedTime = Math.max(0, Math.min(timeSeconds, duration));

    if (this.shifter && duration > 0) {
      // Set percentage to seek the PitchShifter to the desired position
      const pct = (clampedTime / duration) * 100;
      this.shifter.percentagePlayed = pct;
      this.lastReportedTime = clampedTime;
    } else {
      this.lastReportedTime = clampedTime;
    }

    // If we're playing but had to recreate the shifter, reconnect
    if (this.playing && this.shifter && !this.connected) {
      this.shifter.connect(this.gainNode);
      this.connected = true;
    }
  }

  getCurrentTime(): number {
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
    if (this.shifter) {
      this.shifter.pitchSemitones = halfSteps;
    }
    log.info(`setPitch(${halfSteps}) — pitch shift set to ${halfSteps} half-steps`);
  }

  setTempo(deltaBPM: number): void {
    // Convert BPM delta to a ratio: ratio = 1 + delta/reference
    // e.g. +5 BPM at 128 reference = 1.039 (3.9% faster)
    this.tempoRatio = 1.0 + deltaBPM / DEFAULT_REFERENCE_BPM;
    // Clamp to reasonable range (0.5x to 2.0x)
    this.tempoRatio = Math.max(0.5, Math.min(2.0, this.tempoRatio));

    if (this.shifter) {
      this.shifter.tempo = this.tempoRatio;
    }
    log.info(
      `setTempo(${deltaBPM}) — tempo ratio set to ${this.tempoRatio.toFixed(3)} ` +
        `(${deltaBPM >= 0 ? "+" : ""}${deltaBPM} BPM from reference ${DEFAULT_REFERENCE_BPM})`,
    );
  }

  setLoopPoints(startSeconds: number, endSeconds: number): void {
    this.loopStart = startSeconds;
    this.loopEnd = endSeconds;
    log.info(
      `setLoopPoints(${startSeconds.toFixed(2)}, ${endSeconds.toFixed(2)}) — ` +
        (endSeconds > 0 ? "looping enabled" : "looping disabled"),
    );
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

  /** Play a short non-obtrusive beep using an oscillator (for timer alerts). */
  playBeep(): void {
    const osc = this.context.createOscillator();
    const g = this.context.createGain();
    osc.type = "sine";
    osc.frequency.value = 880; // A5
    g.gain.setValueAtTime(0.15, this.context.currentTime);
    g.gain.exponentialRampToValueAtTime(
      0.001,
      this.context.currentTime + 0.5,
    );
    osc.connect(g).connect(this.context.destination);
    osc.start();
    osc.stop(this.context.currentTime + 0.5);
  }

  dispose(): void {
    this.stop();
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

    this.shifter = new PitchShifter(
      this.context,
      this.audioBuffer,
      SHIFTER_BUFFER_SIZE,
      () => this.onShifterEnd(),
    );

    // Apply current pitch and tempo settings
    this.shifter.pitchSemitones = this.pitchHalfSteps;
    this.shifter.tempo = this.tempoRatio;

    // Listen for play events (time updates from the ScriptProcessorNode)
    this.shifter.on("play", (detail) => {
      this.lastReportedTime = detail.timePlayed;

      // Check loop points — if looping is active and we've passed the end,
      // seek back to the start
      if (
        this.loopEnd > 0 &&
        this.loopEnd > this.loopStart &&
        detail.timePlayed >= this.loopEnd
      ) {
        this.seek(this.loopStart);
      }
    });

    // If we had a saved position, seek to it
    if (this.lastReportedTime > 0 && this.getDuration() > 0) {
      const pct = (this.lastReportedTime / this.getDuration()) * 100;
      this.shifter.percentagePlayed = pct;
    }

    log.info("SoundTouchJS PitchShifter created");
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

  private startTimeUpdates(): void {
    this.stopTimeUpdates();
    const tick = () => {
      this.timeUpdateCb?.(this.lastReportedTime);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopTimeUpdates(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
