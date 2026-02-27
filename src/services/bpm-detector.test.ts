import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock web-audio-beat-detector before importing the module under test
vi.mock("web-audio-beat-detector", () => ({
  guess: vi.fn(),
}));

import { detectBPM, disposeDetectionContext } from "./bpm-detector.js";
import { guess } from "web-audio-beat-detector";

// ---------------------------------------------------------------------------
// Fake AudioContext / AudioBuffer for the detection context
// ---------------------------------------------------------------------------

function makeFakeAudioBuffer(duration: number) {
  return {
    duration,
    numberOfChannels: 2,
    sampleRate: 44100,
    length: Math.floor(duration * 44100),
    getChannelData: vi.fn(),
  };
}

const fakeDecodeAudioData = vi.fn();
const fakeClose = vi.fn();

class FakeAudioContext {
  state = "running";
  decodeAudioData = fakeDecodeAudioData;
  close() {
    this.state = "closed";
    return fakeClose();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("AudioContext", FakeAudioContext);
  fakeClose.mockResolvedValue(undefined);
});

afterEach(() => {
  disposeDetectionContext();
  vi.unstubAllGlobals();
});

describe("detectBPM", () => {
  it("returns detected BPM on success", async () => {
    const buffer = makeFakeAudioBuffer(30);
    fakeDecodeAudioData.mockResolvedValue(buffer);
    vi.mocked(guess).mockResolvedValue({ bpm: 128, offset: 0.5 });

    const bpm = await detectBPM(new ArrayBuffer(100));
    expect(bpm).toBe(128);
    expect(guess).toHaveBeenCalledOnce();
  });

  it("analyzes middle 30s for tracks longer than 45s", async () => {
    const buffer = makeFakeAudioBuffer(180);
    fakeDecodeAudioData.mockResolvedValue(buffer);
    vi.mocked(guess).mockResolvedValue({ bpm: 124, offset: 0 });

    await detectBPM(new ArrayBuffer(100));

    const [, offset, length] = vi.mocked(guess).mock.calls[0];
    expect(offset).toBe(Math.floor(180 * 0.25));
    expect(length).toBe(30);
  });

  it("uses full duration for short tracks", async () => {
    const buffer = makeFakeAudioBuffer(20);
    fakeDecodeAudioData.mockResolvedValue(buffer);
    vi.mocked(guess).mockResolvedValue({ bpm: 130, offset: 0 });

    await detectBPM(new ArrayBuffer(100));

    const [, offset, length] = vi.mocked(guess).mock.calls[0];
    expect(offset).toBe(0);
    expect(length).toBe(20);
  });

  it("passes min/max tempo options", async () => {
    const buffer = makeFakeAudioBuffer(30);
    fakeDecodeAudioData.mockResolvedValue(buffer);
    vi.mocked(guess).mockResolvedValue({ bpm: 128, offset: 0 });

    await detectBPM(new ArrayBuffer(100));

    const options = vi.mocked(guess).mock.calls[0][3];
    expect(options).toEqual({ minTempo: 90, maxTempo: 170 });
  });

  it("returns 0 when detection fails", async () => {
    fakeDecodeAudioData.mockRejectedValue(new Error("decode error"));
    const bpm = await detectBPM(new ArrayBuffer(100));
    expect(bpm).toBe(0);
  });

  it("returns 0 when guess() throws", async () => {
    const buffer = makeFakeAudioBuffer(30);
    fakeDecodeAudioData.mockResolvedValue(buffer);
    vi.mocked(guess).mockRejectedValue(new Error("analysis error"));

    const bpm = await detectBPM(new ArrayBuffer(100));
    expect(bpm).toBe(0);
  });
});

describe("disposeDetectionContext", () => {
  it("closes the detection context", async () => {
    const buffer = makeFakeAudioBuffer(10);
    fakeDecodeAudioData.mockResolvedValue(buffer);
    vi.mocked(guess).mockResolvedValue({ bpm: 128, offset: 0 });

    await detectBPM(new ArrayBuffer(100));
    disposeDetectionContext();
    expect(fakeClose).toHaveBeenCalledOnce();
  });
});
