/**
 * BPM (beats per minute) detection service.
 *
 * Uses the web-audio-beat-detector library (MIT license) to analyze an
 * AudioBuffer and estimate the tempo. The library uses a Web Worker internally
 * so analysis does not block the main thread.
 *
 * Square dance music typically falls in the 118–134 BPM range. We configure the
 * detector with a 90–170 BPM window to capture the fundamental beat while
 * avoiding octave errors (detecting at half or double the true tempo).
 *
 * Usage:
 *   const bpm = await detectBPM(arrayBuffer);
 *   if (bpm > 0) song.originalTempo = bpm;
 *
 * See FUTURE.md for the feature requirement; see BACKLOG.md for the design
 * decision selecting web-audio-beat-detector.
 */

import { guess } from "web-audio-beat-detector";
import { log } from "./logger.js";

/**
 * Tempo detection settings.
 * Square dance music is typically 118–134 BPM. We use a wider window
 * (90–170) to handle edge cases like slow patter or fast singing calls.
 */
const MIN_TEMPO = 90;
const MAX_TEMPO = 170;

/**
 * We decode audio in a one-shot AudioContext that is closed after use.
 * This avoids interference with the playback AudioContext. A single
 * persistent context is reused across calls to avoid creating too many.
 */
let detectionContext: AudioContext | null = null;

function getDetectionContext(): AudioContext {
  if (!detectionContext || detectionContext.state === "closed") {
    detectionContext = new AudioContext();
  }
  return detectionContext;
}

/**
 * Detect the BPM of an audio file from its raw binary data.
 *
 * @param audioData  The raw audio file bytes (e.g. from readBinaryFile).
 * @returns The detected BPM (rounded integer), or 0 if detection failed.
 *
 * Postcondition: return value is 0 (failed) or a positive integer.
 */
export async function detectBPM(audioData: ArrayBuffer): Promise<number> {
  try {
    const ctx = getDetectionContext();
    // decodeAudioData consumes the ArrayBuffer, so we must copy it
    const copy = audioData.slice(0);
    const audioBuffer = await ctx.decodeAudioData(copy);

    // Analyze a portion of the track for speed. The middle 30 seconds
    // tends to have the steadiest beat (avoids intros/outros with
    // tempo changes or silence).
    const duration = audioBuffer.duration;
    let offset = 0;
    let analysisLength = duration;
    if (duration > 45) {
      // Use 30 seconds starting from 25% into the track
      offset = Math.floor(duration * 0.25);
      analysisLength = 30;
    }

    const result = await guess(audioBuffer, offset, analysisLength, {
      minTempo: MIN_TEMPO,
      maxTempo: MAX_TEMPO,
    });

    const bpm = result.bpm;
    log.info(`BPM detected: ${bpm} (offset: ${result.offset.toFixed(2)}s)`);
    return bpm;
  } catch (err) {
    log.warn("BPM detection failed:", err);
    return 0;
  }
}

/**
 * Clean up the detection AudioContext. Call when the app is being disposed.
 */
export function disposeDetectionContext(): void {
  if (detectionContext && detectionContext.state !== "closed") {
    detectionContext.close();
    detectionContext = null;
  }
}
