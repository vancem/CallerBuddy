import { describe, it, expect } from "vitest";
import {
  PLAY_HISTORY_HALF_LIFE_DAYS,
  PLAY_STATS_UPDATE_MIN_INTERVAL_MS,
  qualifyingPlayWallSeconds,
  nextPlayWeight,
  displayPlayWeight,
  tempoRatioFromSong,
  daysSinceLastUsedMs,
  shouldRefreshPlayStats,
} from "./play-history.js";

describe("qualifyingPlayWallSeconds", () => {
  it("is 90% of duration at tempo ratio 1", () => {
    expect(qualifyingPlayWallSeconds(100, 1)).toBe(90);
  });

  it("scales inversely with tempo ratio (faster play = less wall time needed)", () => {
    expect(qualifyingPlayWallSeconds(128, 2)).toBeCloseTo(57.6, 5);
  });

  it("returns infinity for non-positive duration", () => {
    expect(qualifyingPlayWallSeconds(0, 1)).toBe(Number.POSITIVE_INFINITY);
    expect(qualifyingPlayWallSeconds(-1, 1)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("nextPlayWeight", () => {
  it("first play yields 1", () => {
    expect(nextPlayWeight(0, 0)).toBe(1);
    expect(nextPlayWeight(0, 100)).toBe(1);
  });

  it("converges toward 2 when plays are spaced by one half-life", () => {
    let w = 0;
    for (let i = 0; i < 40; i++) {
      w = nextPlayWeight(w, PLAY_HISTORY_HALF_LIFE_DAYS);
    }
    expect(w).toBeCloseTo(2, 5);
  });

  it("immediate replay adds 1 to previous weight", () => {
    expect(nextPlayWeight(2, 0)).toBe(3);
  });
});

describe("displayPlayWeight", () => {
  it("is 0 when never played", () => {
    expect(displayPlayWeight(2, "", Date.now())).toBe(0);
    expect(displayPlayWeight(2, "   ", Date.now())).toBe(0);
  });

  it("treats non-finite weight as 0", () => {
    const t = "2020-01-01T00:00:00.000Z";
    expect(displayPlayWeight(NaN, t, Date.parse(t))).toBe(0);
  });

  it("decays after lastUsed when time passes", () => {
    const last = "2020-01-01T00:00:00.000Z";
    const atLast = Date.parse(last);
    expect(displayPlayWeight(2, last, atLast)).toBeCloseTo(2, 5);
    const later = atLast + PLAY_HISTORY_HALF_LIFE_DAYS * 86400000;
    expect(displayPlayWeight(2, last, later)).toBeCloseTo(1, 5);
  });
});

describe("tempoRatioFromSong", () => {
  it("uses 128 default reference when originalTempo is 0", () => {
    expect(tempoRatioFromSong({ originalTempo: 0, deltaTempo: 0 })).toBe(1);
    expect(tempoRatioFromSong({ originalTempo: 0, deltaTempo: 128 })).toBe(2);
  });

  it("uses originalTempo as reference when set", () => {
    expect(tempoRatioFromSong({ originalTempo: 120, deltaTempo: 0 })).toBe(1);
    expect(tempoRatioFromSong({ originalTempo: 120, deltaTempo: 12 })).toBeCloseTo(1.1, 5);
  });

  it("clamps ratio to 0.5–2", () => {
    expect(tempoRatioFromSong({ originalTempo: 0, deltaTempo: -200 })).toBe(0.5);
    expect(tempoRatioFromSong({ originalTempo: 0, deltaTempo: 500 })).toBe(2);
  });
});

describe("daysSinceLastUsedMs", () => {
  it("returns 0 for empty lastUsed", () => {
    expect(daysSinceLastUsedMs("", Date.now())).toBe(0);
  });
});

describe("shouldRefreshPlayStats", () => {
  const t0 = "2020-06-01T12:00:00.000Z";
  const base = Date.parse(t0);

  it("is true when lastUsed is empty or invalid", () => {
    expect(shouldRefreshPlayStats("", base)).toBe(true);
    expect(shouldRefreshPlayStats("not-a-date", base)).toBe(true);
  });

  it("is false within the cooldown after lastUsed", () => {
    expect(shouldRefreshPlayStats(t0, base)).toBe(false);
    expect(shouldRefreshPlayStats(t0, base + PLAY_STATS_UPDATE_MIN_INTERVAL_MS - 1)).toBe(
      false,
    );
  });

  it("is true at or after the cooldown", () => {
    expect(shouldRefreshPlayStats(t0, base + PLAY_STATS_UPDATE_MIN_INTERVAL_MS)).toBe(true);
    expect(shouldRefreshPlayStats(t0, base + PLAY_STATS_UPDATE_MIN_INTERVAL_MS + 60_000)).toBe(
      true,
    );
  });
});
