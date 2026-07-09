import { describe, it, expect } from "vitest";
import {
  PLAY_HISTORY_HALF_LIFE_DAYS,
  qualifyingPlayWallSeconds,
  nextPlayWeight,
  displayPlayWeight,
  tempoRatioFromSong,
  daysSinceLastUsedMs,
  shouldRefreshPlayStats,
  lastUsedIsoFromMs,
  roundPlayWeight,
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

describe("roundPlayWeight", () => {
  it("rounds to nearest 1/100", () => {
    expect(roundPlayWeight(1.234)).toBe(1.23);
    expect(roundPlayWeight(1.235)).toBe(1.24);
    expect(roundPlayWeight(2)).toBe(2);
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

  it("rounds stored weight to nearest 1/100", () => {
    const w = nextPlayWeight(1.111, 14);
    expect(w).toBe(Math.round((1 + Math.pow(2, -14 / PLAY_HISTORY_HALF_LIFE_DAYS) * 1.111) * 100) / 100);
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

describe("lastUsedIsoFromMs", () => {
  it("truncates to start of local calendar day", () => {
    const afternoon = new Date(2020, 5, 15, 14, 30, 0).getTime();
    const iso = lastUsedIsoFromMs(afternoon);
    expect(Date.parse(iso)).toBe(new Date(2020, 5, 15, 0, 0, 0, 0).getTime());
  });
});

describe("daysSinceLastUsedMs", () => {
  it("returns 0 for empty lastUsed", () => {
    expect(daysSinceLastUsedMs("", Date.now())).toBe(0);
  });

  it("counts whole calendar days in local time", () => {
    const morning = new Date(2020, 5, 1, 9, 0, 0).getTime();
    const evening = new Date(2020, 5, 1, 20, 0, 0).getTime();
    const lastUsed = lastUsedIsoFromMs(morning);
    expect(daysSinceLastUsedMs(lastUsed, evening)).toBe(0);

    const nextDay = new Date(2020, 5, 2, 10, 0, 0).getTime();
    expect(daysSinceLastUsedMs(lastUsed, nextDay)).toBe(1);
  });
});

describe("shouldRefreshPlayStats", () => {
  it("is true when lastUsed is empty or invalid", () => {
    const now = new Date(2020, 5, 1, 12, 0, 0).getTime();
    expect(shouldRefreshPlayStats("", now)).toBe(true);
    expect(shouldRefreshPlayStats("not-a-date", now)).toBe(true);
  });

  it("is false on the same local calendar day", () => {
    const morning = new Date(2020, 5, 1, 9, 0, 0).getTime();
    const evening = new Date(2020, 5, 1, 20, 0, 0).getTime();
    const lastUsed = lastUsedIsoFromMs(morning);
    expect(shouldRefreshPlayStats(lastUsed, evening)).toBe(false);
  });

  it("is true on a later local calendar day", () => {
    const day1 = new Date(2020, 5, 1, 12, 0, 0).getTime();
    const day2 = new Date(2020, 5, 2, 8, 0, 0).getTime();
    const lastUsed = lastUsedIsoFromMs(day1);
    expect(shouldRefreshPlayStats(lastUsed, day2)).toBe(true);
  });
});
