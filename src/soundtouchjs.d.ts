/**
 * Type declarations for soundtouchjs v0.3.0
 *
 * SoundTouchJS is a JS port of the SoundTouch C++ library providing real-time
 * pitch shifting and tempo stretching via Web Audio ScriptProcessorNode.
 *
 * These declarations cover the subset of the API used by CallerBuddy.
 * See: https://github.com/cutterbl/SoundTouchJS
 */

declare module "soundtouchjs" {
  /** Detail payload emitted with the 'play' event on the PitchShifter node. */
  export interface PlayEventDetail {
    /** Seconds of source audio played so far. */
    timePlayed: number;
    /** Human-readable "MM:SS" string of time played. */
    formattedTimePlayed: string;
    /** 0–100 percentage of source audio played. */
    percentagePlayed: number;
  }

  /**
   * High-level wrapper that combines SoundTouch processing with a Web Audio
   * ScriptProcessorNode.  Accepts an AudioBuffer, processes it through the
   * SoundTouch pitch/tempo algorithm, and outputs to the Web Audio graph.
   *
   * Usage:
   *   const shifter = new PitchShifter(ctx, buffer, 4096);
   *   shifter.pitchSemitones = -2;   // shift down 2 half-steps
   *   shifter.tempo = 1.05;          // 5% faster
   *   shifter.connect(gainNode);     // start playback
   *   shifter.disconnect();          // pause/stop
   */
  export class PitchShifter {
    constructor(
      context: AudioContext,
      buffer: AudioBuffer,
      bufferSize: number,
      onEnd?: () => void,
    );

    /** Total duration of the source buffer in seconds. */
    readonly duration: number;

    /** Sample rate from the AudioContext. */
    readonly sampleRate: number;

    /** Seconds of source audio played so far. */
    timePlayed: number;

    /** Current source position in samples. */
    sourcePosition: number;

    /** Duration formatted as "MM:SS". */
    readonly formattedDuration: string;

    /** Time played formatted as "MM:SS". */
    readonly formattedTimePlayed: string;

    /**
     * ASYMMETRIC API — getter and setter use different scales:
     *   - Getter returns 0–100 (percentage).
     *   - Setter expects 0–1 (fraction).
     * Verified from the official example (public/example.js).
     */
    get percentagePlayed(): number;
    set percentagePlayed(perc: number);

    /** The underlying ScriptProcessorNode. */
    readonly node: ScriptProcessorNode;

    /** Pitch as a ratio (1.0 = original, 2.0 = octave up, 0.5 = octave down). */
    set pitch(value: number);

    /** Pitch shift in semitones (half-steps). +1 = one half-step up, -1 = down. */
    set pitchSemitones(value: number);

    /**
     * Playback rate ratio (1.0 = normal). Changes BOTH tempo and pitch
     * simultaneously (like changing vinyl speed). Usually prefer `tempo`
     * or `pitch`/`pitchSemitones` for independent control.
     */
    set rate(value: number);

    /** Tempo as a ratio (1.0 = original, 1.1 = 10% faster, 0.9 = 10% slower). */
    set tempo(value: number);

    /** Connect output to another Web Audio node. Starts audio flowing. */
    connect(toNode: AudioNode): void;

    /** Disconnect from all downstream nodes. Stops audio output. */
    disconnect(): void;

    /**
     * Register an event listener. The only documented event is `"play"`,
     * dispatched on each ScriptProcessor buffer with a {@link PlayEventDetail}.
     */
    on(eventName: string, cb: (detail: PlayEventDetail) => void): void;

    /** Remove event listener(s). If eventName is null, removes all. */
    off(eventName?: string | null): void;
  }

  export class SoundTouch {
    constructor();
    set pitch(value: number);
    set pitchSemitones(value: number);
    set pitchOctaves(value: number);
    set rate(value: number);
    set rateChange(value: number);
    get tempo(): number;
    set tempo(value: number);
    set tempoChange(value: number);
    get inputBuffer(): FifoSampleBuffer;
    get outputBuffer(): FifoSampleBuffer;
    clear(): void;
    clone(): SoundTouch;
    process(): void;
  }

  export class FifoSampleBuffer {
    get vector(): Float32Array;
    get position(): number;
    get startIndex(): number;
    get frameCount(): number;
    get endIndex(): number;
    clear(): void;
    put(numFrames: number): void;
    putSamples(
      samples: Float32Array,
      position?: number,
      numFrames?: number,
    ): void;
    receive(numFrames: number): void;
    receiveSamples(output: Float32Array, numFrames?: number): void;
  }

  export class WebAudioBufferSource {
    constructor(buffer: AudioBuffer);
    get dualChannel(): boolean;
    get position(): number;
    set position(value: number);
    extract(
      target: Float32Array,
      numFrames: number,
      position?: number,
    ): number;
  }

  export class SimpleFilter {
    constructor(
      sourceSound: WebAudioBufferSource,
      pipe: SoundTouch,
      callback?: () => void,
    );
    get sourcePosition(): number;
    set sourcePosition(value: number);
    get position(): number;
    set position(value: number);
    extract(target: Float32Array, numFrames?: number): number;
  }

  export function getWebAudioNode(
    context: AudioContext,
    filter: SimpleFilter,
    sourcePositionCallback?: (pos: number) => void,
    bufferSize?: number,
  ): ScriptProcessorNode;

  export class RateTransposer {
    constructor(createBuffers: boolean);
    set rate(value: number);
  }

  export class Stretch {
    constructor(createBuffers: boolean);
    set tempo(value: number);
  }
}
