import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/providers/callLog", () => ({ recordProviderCall: vi.fn() }));

import {
  classifyLocationText,
  serpApiLocation,
} from "@/lib/candidates/location";
import {
  chooseShortlist,
  isTooJunior,
  similarityToScore,
} from "@/lib/candidates/preScore";

describe("classifyLocationText", () => {
  it("accepts Egyptian places in English and Arabic", () => {
    expect(classifyLocationText("Cairo, Egypt", "EG").inCountry).toBe(true);
    expect(
      classifyLocationText("New Cairo, Cairo, Egypt", "EG").inCountry,
    ).toBe(true);
    expect(
      classifyLocationText("القاهرة القاهرة الجديدة مصر", "EG").inCountry,
    ).toBe(true);
    expect(
      classifyLocationText("Tanta, Al Gharbiyah, Egypt", "EG").inCountry,
    ).toBe(true);
  });

  it("rejects clearly foreign places, including same-named cities abroad", () => {
    expect(
      classifyLocationText("الإمارات العربية المتحدة", "EG").inCountry,
    ).toBe(false);
    expect(
      classifyLocationText("Dubai, United Arab Emirates", "EG").inCountry,
    ).toBe(false);
    expect(
      classifyLocationText("Alexandria, Virginia, United States", "EG")
        .inCountry,
    ).toBe(false);
  });

  it("is undecided without a place, or for other countries", () => {
    expect(classifyLocationText("Sales Manager", "EG").inCountry).toBeNull();
    expect(classifyLocationText(null, "EG").inCountry).toBeNull();
    expect(classifyLocationText("Cairo, Egypt", "SA").inCountry).toBeNull();
  });
});

describe("serpApiLocation", () => {
  it("uses canonical names so Alexandria isn't ambiguous", () => {
    expect(serpApiLocation("Alexandria", "EG")).toBe(
      "Alexandria,Alexandria Governorate,Egypt",
    );
    expect(serpApiLocation(null, "EG")).toBe("Egypt");
  });
});

describe("pre-score shortlist", () => {
  it("maps similarity onto 0–100", () => {
    expect(similarityToScore(0.1)).toBe(0);
    expect(similarityToScore(0.45)).toBe(50);
    expect(similarityToScore(0.9)).toBe(100);
  });

  it("takes the top N plus up to M thin-snippet extras, never confirmed-foreign", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      personId: `p${i}`,
      preScore: 100 - i,
      thin: i >= 25,
      locationVerified: i === 0 ? false : null,
    }));
    const shortlist = chooseShortlist(rows, 20, 5);
    expect(shortlist).not.toContain("p0");
    expect(shortlist.slice(0, 20)).toEqual(
      rows.slice(1, 21).map((r) => r.personId),
    );
    expect(shortlist.slice(20)).toEqual(["p25", "p26", "p27", "p28", "p29"]);
  });
});

describe("isTooJunior", () => {
  it("flags junior titles only for senior+ jobs", () => {
    expect(isTooJunior("Junior Data Analyst | SQL", "senior")).toBe(true);
    expect(isTooJunior("Data Analysis Intern at X", "lead")).toBe(true);
    expect(isTooJunior("International Sales Manager", "manager")).toBe(false);
    expect(isTooJunior("Junior Data Analyst", "junior")).toBe(false);
    expect(isTooJunior("Junior Data Analyst", null)).toBe(false);
  });

  it("drops too-junior people from the shortlist", () => {
    const rows = [
      {
        personId: "a",
        preScore: 90,
        thin: false,
        locationVerified: true,
        tooJunior: true,
      },
      { personId: "b", preScore: 80, thin: false, locationVerified: true },
    ];
    expect(chooseShortlist(rows, 5, 0)).toEqual(["b"]);
  });
});
