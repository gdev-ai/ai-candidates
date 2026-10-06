import { describe, expect, it } from "vitest";

import { estimateMinutes, FALLBACK_ESTIMATE_MINUTES } from "./runProgress";

describe("estimateMinutes", () => {
  it("falls back when there are too few runs", () => {
    expect(estimateMinutes([])).toBe(FALLBACK_ESTIMATE_MINUTES);
    expect(estimateMinutes([100, 120])).toBe(FALLBACK_ESTIMATE_MINUTES);
  });

  it("rounds the median up to whole minutes", () => {
    expect(estimateMinutes([114, 121, 124, 133, 136])).toBe(3);
    expect(estimateMinutes([50, 55, 60])).toBe(1);
    expect(estimateMinutes([61, 62, 63])).toBe(2);
  });

  it("isn't pulled up by one slow run", () => {
    expect(estimateMinutes([110, 115, 118, 600])).toBe(2);
  });

  it("ignores invalid durations", () => {
    expect(estimateMinutes([NaN, -5, 0, 100, 110, 115])).toBe(2);
  });
});
