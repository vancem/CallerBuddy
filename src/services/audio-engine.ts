/**
 * Audio engine: interface and Web Audio API implementation.
 *
 * The interface abstracts audio playback so the pitch/tempo processing backend
 * can be swapped without changing the rest of the app. See BACKLOG.md design
 * decisions (Web Audio API, SoundTouchJS evaluation).
 *
 * Current implementation:
 *  - Play/pause/stop/seek/volume: fully functional via Web Audio API.
 *  - Pitch and tempo modification: STUBBED (logged, no-op). The interface is
 *    ready for a real implementation (e.g. SoundTouchJS) to be plugged in.
 *  - Looping: functional via AudioBufferSourceNode loop properties.
 */

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
   * STUB in the initial implementation.
   */
  setPitch(halfSteps: number): void;

  /**
   * Set tempo adjustment in BPM delta (signed).
   * STUB in the initial implementation.
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
// Web Audio implementation
// ---------------------------------------------------------------------------

export class WebAudioEngine implements AudioEngine {
  private context: AudioContext;
  private audioBuffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode;

  /** When the current source started in context.currentTime coordinates. */
  private startContextTime = 0;
  /** Playback offset (seconds into the song) when play() was last called. */
  private playOffset = 0;
  private playing = false;

  private loopStart = 0;
  private loopEnd = 0;

  private endedCb: EndedCallback | null = null;
  private timeUpdateCb: TimeUpdateCallback | null = null;
  private rafId: number | null = null;

  constructor() {
    this.context = new AudioContext();
    this.gainNode = this.context.createGain();
    this.gainNode.connect(this.context.destination);
  }

  async loadAudio(audioData: ArrayBuffer): Promise<void> {
    this.stop();
    this.audioBuffer = await this.context.decodeAudioData(audioData);
    this.playOffset = 0;
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

    const source = this.context.createBufferSource();
    source.buffer = this.audioBuffer;
    source.connect(this.gainNode);

    // Looping
    if (this.loopEnd > 0 && this.loopEnd > this.loopStart) {
      source.loop = true;
      source.loopStart = this.loopStart;
      source.loopEnd = this.loopEnd;
    }

    source.onended = () => {
      if (this.playing) {
        this.playing = false;
        this.stopTimeUpdates();
        this.endedCb?.();
      }
    };

    source.start(0, this.playOffset);
    this.sourceNode = source;
    this.startContextTime = this.context.currentTime;
    this.playing = true;
    this.startTimeUpdates();
  }

  pause(): void {
    if (!this.playing) return;
    this.playOffset = this.getCurrentTime();
    this.destroySource();
    this.playing = false;
    this.stopTimeUpdates();
  }

  stop(): void {
    this.destroySource();
    this.playOffset = 0;
    this.playing = false;
    this.stopTimeUpdates();
  }

  seek(timeSeconds: number): void {
    const wasPlaying = this.playing;
    if (wasPlaying) {
      this.destroySource();
      this.playing = false;
    }
    this.playOffset = Math.max(
      0,
      Math.min(timeSeconds, this.getDuration()),
    );
    if (wasPlaying) {
      this.play();
    }
  }

  getCurrentTime(): number {
    if (!this.playing) return this.playOffset;
    const elapsed = this.context.currentTime - this.startContextTime;
    const raw = this.playOffset + elapsed;
    const duration = this.getDuration();
    return Math.min(raw, duration);
  }

  getDuration(): number {
    return this.audioBuffer?.duration ?? 0;
  }

  setVolume(volume: number): void {
    // volume is 0-100 → gain is 0-1
    this.gainNode.gain.value = Math.max(0, Math.min(volume, 100)) / 100;
  }

  setPitch(_halfSteps: number): void {
    // TODO: Implement pitch shifting (SoundTouchJS or similar).
    // See BACKLOG.md: audio processing is stubbed for V1.
    log.info(`setPitch(${_halfSteps}) — STUB, not yet implemented`);
  }

  setTempo(_deltaBPM: number): void {
    // TODO: Implement tempo adjustment (SoundTouchJS or similar).
    // See BACKLOG.md: audio processing is stubbed for V1.
    log.info(`setTempo(${_deltaBPM}) — STUB, not yet implemented`);
  }

  setLoopPoints(startSeconds: number, endSeconds: number): void {
    this.loopStart = startSeconds;
    this.loopEnd = endSeconds;

    // Update live source if playing
    if (this.sourceNode) {
      if (endSeconds > 0 && endSeconds > startSeconds) {
        this.sourceNode.loop = true;
        this.sourceNode.loopStart = startSeconds;
        this.sourceNode.loopEnd = endSeconds;
      } else {
        this.sourceNode.loop = false;
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

  private destroySource(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.onended = null;
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch {
        // source may already have stopped
      }
      this.sourceNode = null;
    }
  }

  private startTimeUpdates(): void {
    this.stopTimeUpdates();
    const tick = () => {
      this.timeUpdateCb?.(this.getCurrentTime());
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
