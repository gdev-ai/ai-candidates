// Shared by the New Job form's "Job Details" section and the AI-extracted
// "Requirements Editor" section, so both dropdowns offer the same choices.
export const EMPLOYMENT_TYPES = [
  "Full-time",
  "Part-time",
  "Contract",
  "Internship",
];
export const WORK_ARRANGEMENTS = ["Remote", "Hybrid", "On-site"];

// Every job sources nationwide in Egypt — this is the only value the
// Location dropdown offers (see CITY_OPTIONS below for the optional
// specific-city field that narrows search targeting further).
export const LOCATION_OPTIONS = ["Egypt"];

// The four cities the optional "City" field offers. Full governorate names
// (not abbreviations like "Alex") so they match EGYPT_GOVERNORATES/
// CLEAN_GOVERNORATE_VALUES in locationBias.ts — required for
// resolveCleanLocationText and the SerpApi location param to recognize them.
export const CITY_OPTIONS = ["Cairo", "Alexandria", "Giza", "Suez"];
