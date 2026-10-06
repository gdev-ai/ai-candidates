import { describe, expect, it } from "vitest";

import {
  afterBuffer,
  blockedReason,
  buildWindows,
  formatResetsIn,
  overallSearchesLeft,
  quotaStatus,
  searchesCovered,
  type ProviderQuota,
  type UsageRow,
} from "@/lib/usage/credits";

const limits = { daily: 20, weekly: 80, monthly: 250 };

function rows(day: number, week: number, month: number): UsageRow[] {
  return [
    {
      period: "day",
      starts_at: "2026-10-04T21:00:00Z",
      resets_at: "2026-10-05T21:00:00Z",
      searches: day,
      spend_usd: "0.93",
    },
    {
      period: "week",
      starts_at: "2026-10-03T21:00:00Z",
      resets_at: "2026-10-10T21:00:00Z",
      searches: week,
      spend_usd: 1.5,
    },
    {
      period: "month",
      starts_at: "2026-09-30T21:00:00Z",
      resets_at: "2026-10-31T22:00:00Z",
      searches: month,
      spend_usd: 4,
    },
  ];
}

function provider(overrides: Partial<ProviderQuota>): ProviderQuota {
  return {
    provider: "serper",
    label: "Serper",
    role: "search",
    status: "ok",
    left: "",
    detail: null,
    searchesLeft: null,
    ...overrides,
  };
}

describe("buildWindows", () => {
  it("applies each period's limit and never goes below zero left", () => {
    const windows = buildWindows(rows(25, 30, 40), limits);
    expect(windows.map((w) => [w.period, w.used, w.limit, w.left])).toEqual([
      ["day", 25, 20, 0],
      ["week", 30, 80, 50],
      ["month", 40, 250, 210],
    ]);
    expect(windows[0]?.spendUsd).toBe(0.93);
  });
});

describe("afterBuffer", () => {
  it("holds back 20%, and at least 2 searches", () => {
    expect(afterBuffer(100)).toBe(80);
    expect(afterBuffer(79)).toBe(63);
    expect(afterBuffer(10)).toBe(8);
    expect(afterBuffer(3)).toBe(1);
    expect(afterBuffer(1)).toBe(0);
    expect(afterBuffer(0)).toBe(0);
  });
});

describe("searchesCovered", () => {
  it("floors whole searches, keeps the buffer, needs a measurable price", () => {
    expect(searchesCovered(2393, 30)).toBe(63);
    expect(searchesCovered(0.04, 0.05)).toBe(0);
    expect(searchesCovered(null, 30)).toBeNull();
    expect(searchesCovered(10, 0)).toBeNull();
  });
});

describe("quotaStatus", () => {
  it("is out at zero, low at three or fewer", () => {
    expect(quotaStatus(0)).toBe("out");
    expect(quotaStatus(3)).toBe("low");
    expect(quotaStatus(4)).toBe("ok");
    expect(quotaStatus(null)).toBe("unknown");
  });
});

describe("overallSearchesLeft", () => {
  it("is the tightest of the limits and the search provider", () => {
    const windows = buildWindows(rows(5, 5, 5), limits);
    expect(overallSearchesLeft(windows, [])).toBe(15);
    expect(overallSearchesLeft(windows, [provider({ searchesLeft: 7 })])).toBe(
      7,
    );
  });

  it("adds enrichment quotas together, only when all are measurable", () => {
    const windows = buildWindows(rows(0, 0, 0), limits);
    const apify = provider({
      provider: "apify",
      role: "enrich",
      searchesLeft: 4,
    });
    const harvest = provider({
      provider: "harvestapi",
      role: "enrich",
      searchesLeft: 6,
    });
    expect(overallSearchesLeft(windows, [apify, harvest])).toBe(10);
    expect(
      overallSearchesLeft(windows, [apify, { ...harvest, searchesLeft: null }]),
    ).toBe(20);
  });
});

describe("blockedReason", () => {
  it("names the used-up limit that resets last", () => {
    const blocked = blockedReason(buildWindows(rows(20, 80, 100), limits), []);
    expect(blocked).toEqual({
      reason: "Weekly limit of 80 searches reached.",
      resetsAt: "2026-10-10T21:00:00Z",
    });
  });

  it("blocks when every profile provider is out, until the earliest renewal", () => {
    const windows = buildWindows(rows(1, 1, 1), limits);
    const apify = provider({
      provider: "apify",
      label: "Apify",
      role: "enrich",
      status: "out",
      resetsAt: "2026-10-11T23:59:59.999Z",
    });
    expect(blockedReason(windows, [apify])).toEqual({
      reason: "Apify has no profile credit left.",
      resetsAt: "2026-10-11T23:59:59.999Z",
    });
    const harvest = provider({
      provider: "harvestapi",
      label: "HarvestAPI",
      role: "enrich",
      status: "unknown",
    });
    expect(blockedReason(windows, [apify, harvest])).toBeNull();
  });

  it("blocks on a search provider out of credits", () => {
    const windows = buildWindows(rows(1, 1, 1), limits);
    expect(blockedReason(windows, [provider({ status: "out" })])?.reason).toBe(
      "Serper has no search credits left.",
    );
  });

  it("is null with searches left", () => {
    expect(blockedReason(buildWindows(rows(1, 1, 1), limits), [])).toBeNull();
  });
});

describe("formatResetsIn", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  it("formats days, hours and minutes", () => {
    expect(formatResetsIn("2026-10-05T21:00:00Z", now)).toBe("in 9h");
    expect(formatResetsIn("2026-10-05T12:30:00Z", now)).toBe("in 30m");
    expect(formatResetsIn("2026-10-10T21:00:00Z", now)).toBe("in 5d 9h");
    expect(formatResetsIn("2026-10-05T11:00:00Z", now)).toBe("in 1m");
  });
});
