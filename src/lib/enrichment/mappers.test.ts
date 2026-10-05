import { describe, expect, it, vi } from "vitest";

import { matchItemsToTargets } from "@/lib/enrichment";
import { mapExaPerson } from "@/lib/enrichment/mapExa";
import { mapHarvestElement } from "@/lib/enrichment/mapHarvest";
import { mapSupremeItem, type SupremeItem } from "@/lib/enrichment/mapSupreme";

vi.mock("@/lib/env", () => ({ env: { APIFY_ACTOR_ID: "supreme_coder~linkedin-profile-scraper" } }));
vi.mock("@/lib/providers/callLog", () => ({ recordProviderCall: vi.fn() }));

// Synthetic items with the field shapes seen in the live runs (no real people).
const supreme: SupremeItem = {
  inputUrl: "https://eg.linkedin.com/in/test-person-123/en",
  id: "724690032",
  profileId: "ACoAAtest",
  publicIdentifier: "test-person-123",
  firstName: "Test",
  lastName: "Person",
  headline: "Senior Site Engineer",
  summary: "Builds things.",
  created: 1553016994496,
  premium: false,
  isVerified: true,
  countryCode: "EG",
  geoLocationName: "Tanta, Al Gharbiyah, Egypt",
  companyName: "Cairo Builders",
  currentCompany: { entityUrn: "urn:li:fsd_company:102083831", name: "Cairo Builders" },
  followerCount: 1065,
  connectionsCount: 500,
  pictureUrl: { "400x400": "https://img/400", "800x800": "https://img/800" },
  positions: [
    {
      title: "Senior Site Engineer",
      timePeriod: { startDate: { month: 10, year: 2025 }, endDate: null },
      totalDuration: "1 yr",
      insights: "Skills: Site Supervision · Concrete Works",
      company: { url: "https://www.linkedin.com/company/102083831/", name: "Cairo Builders" },
    },
    {
      company: { url: "https://www.linkedin.com/company/3185/", name: "BigCo" },
      locationName: "Giza, Egypt",
      totalDuration: "4 yrs",
      positions: [
        { title: "Engineer", timePeriod: { startDate: { month: 3, year: 2022 }, endDate: { month: 9, year: 2025 } } },
        { title: "Junior Engineer", timePeriod: { startDate: { month: 1, year: 2020 }, endDate: { month: 3, year: 2022 } } },
      ],
    },
  ],
  educations: [
    { schoolName: "Tanta University", degreeName: "BSc", fieldOfStudy: "Civil", timePeriod: { startDate: { year: 2014 }, endDate: { year: 2019 } } },
  ],
  skills: [{ name: "AutoCAD", endorsements: 4 }, { name: "Revit", endorsements: 0 }],
  certifications: [{ name: "PMP", authority: "PMI", timePeriod: { startDate: { month: 5, year: 2024 } }, issueDate: null }],
  languages: [{ name: "العربية", proficiency: "" }, { name: "English", proficiency: "Full professional proficiency" }],
};

describe("mapSupremeItem", () => {
  const profile = mapSupremeItem(supreme);

  it("maps identity, location and signals", () => {
    expect(profile).toMatchObject({
      source: "apify_supreme",
      publicIdentifier: "test-person-123",
      memberId: "ACoAAtest",
      objectUrn: "724690032",
      profileUrl: "https://www.linkedin.com/in/test-person-123",
      fullName: "Test Person",
      currentTitle: "Senior Site Engineer",
      currentCompany: "Cairo Builders",
      currentCompanyLiId: "102083831",
      countryCode: "EG",
      city: "Tanta",
      region: "Al Gharbiyah",
      verified: true,
      photoUrl: "https://img/800",
    });
  });

  it("flattens grouped roles and marks the current one by endDate null", () => {
    expect(profile.experiences).toHaveLength(3);
    expect(profile.experiences[0]).toMatchObject({ is_current: true, start_month: 10, skills: ["Site Supervision", "Concrete Works"] });
    expect(profile.experiences[1]).toMatchObject({
      title: "Engineer",
      company: "BigCo",
      company_li_id: "3185",
      location: "Giza, Egypt",
      end_year: 2025,
      end_month: 9,
      is_current: false,
    });
    expect(profile.experiences[1]?.experience_group_id).toBe(profile.experiences[2]?.experience_group_id);
  });

  it("maps skills, certifications and languages", () => {
    expect(profile.skills).toEqual([
      { name: "AutoCAD", endorsements: 4, is_top: false },
      { name: "Revit", endorsements: 0, is_top: false },
    ]);
    expect(profile.certifications[0]).toMatchObject({ title: "PMP", issuer: "PMI", issued_on: "2024-05-01" });
    expect(profile.languages).toEqual([
      { name: "العربية", name_normalized: "ar", proficiency: null },
      { name: "English", name_normalized: "en", proficiency: "full_professional" },
    ]);
  });
});

describe("mapHarvestElement", () => {
  it("parses month names, Present, endorsement text and cert dates", () => {
    const profile = mapHarvestElement(
      {
        id: "ACoAAh",
        publicIdentifier: "Harvest-Person",
        objectUrn: "496487437",
        firstName: "H",
        lastName: "P",
        location: { linkedinText: "Cairo, Egypt", countryCode: "EG", parsed: { city: "Cairo", state: "Cairo" } },
        currentPosition: [{ position: "Head of Sales", companyName: "Nozha Beach", companyId: "18563669" }],
        topSkills: ["Negotiation"],
        experience: [
          { position: "Head of Sales", companyName: "Nozha Beach", startDate: { month: "Jul", year: 2026 }, endDate: { text: "Present" } },
          { position: "Sales Manager", startDate: { month: "Feb", year: 2023 }, endDate: { month: "Jan", year: 2024, text: "Jan 2024" } },
        ],
        skills: [{ name: "Negotiation", endorsements: "9 endorsements" }, { name: "CRM" }],
        certifications: [{ title: "CSPO", issuedBy: "Scrum Alliance", issuedAt: "Issued May 2024 · Expires May 2026" }],
        languages: [{ name: "Arabic", proficiency: "Native or bilingual proficiency" }],
        sectionTotals: { skills: 31 },
      },
      "https://eg.linkedin.com/in/harvest-person",
    );
    expect(profile.publicIdentifier).toBe("harvest-person");
    expect(profile.experiences[0]).toMatchObject({ start_month: 7, is_current: true, end_year: null });
    expect(profile.experiences[1]).toMatchObject({ start_month: 2, end_month: 1, is_current: false });
    expect(profile.skills).toEqual([
      { name: "Negotiation", endorsements: 9, is_top: true },
      { name: "CRM", endorsements: null, is_top: false },
    ]);
    expect(profile.certifications[0]).toMatchObject({ issued_on: "2024-05-01", expires_on: "2026-05-01" });
    expect(profile.languages[0]).toMatchObject({ name_normalized: "ar", proficiency: "native" });
    expect(profile.sectionTotals).toEqual({ skills: 31 });
  });
});

describe("mapExaPerson", () => {
  it("maps dated work history; open-ended roles are current", () => {
    const profile = mapExaPerson(
      {
        name: "E P",
        location: "Cairo, Egypt",
        workHistory: [
          { title: "Director", dates: { from: "2026-05-01", to: null }, company: { name: "A" } },
          { title: "Manager", dates: { from: "2022-03-01", to: "2026-04-01" }, company: { name: "B" } },
        ],
        educationHistory: [{ degree: "BA", dates: { from: "1996", to: "2001" }, institution: { name: "Uni" } }],
      },
      "https://www.linkedin.com/in/ep",
    );
    expect(profile.source).toBe("exa");
    expect(profile.currentTitle).toBe("Director");
    expect(profile.experiences[0]).toMatchObject({ start_year: 2026, start_month: 5, is_current: true });
    expect(profile.experiences[1]).toMatchObject({ end_year: 2026, end_month: 4, is_current: false });
    expect(profile.education[0]).toMatchObject({ start_year: 1996, end_year: 2001 });
    expect(profile.countryCode).toBe("EG");
  });
});

describe("matchItemsToTargets", () => {
  it("maps by inputUrl even when LinkedIn renamed the slug", () => {
    const targets = [
      { personId: "p1", url: "https://www.linkedin.com/in/madhu-074b611bb/" },
      { personId: "p2", url: "https://eg.linkedin.com/in/gone" },
      { personId: "p3", url: "https://eg.linkedin.com/in/never-returned" },
    ];
    const result = matchItemsToTargets(
      [
        { inputUrl: "https://www.linkedin.com/in/madhu-074b611bb/", publicIdentifier: "madhu-a7b3c3d0e7" },
        { inputUrl: "https://eg.linkedin.com/in/gone", error: "Failed to access this profile" },
      ],
      targets,
    );
    expect(result.matched.map((m) => m.target.personId)).toEqual(["p1"]);
    expect(result.failed.map((t) => t.personId)).toEqual(["p2"]);
    expect(result.missing.map((t) => t.personId)).toEqual(["p3"]);
  });
});
