import { describe, expect, it } from "vitest";

import { extractAnalysisOutput } from "./analysis";

const ANALYSIS = { job_title: "Dev", required_skills: ["React"] };

describe("extractAnalysisOutput", () => {
  it("reads output_parsed", () => {
    expect(extractAnalysisOutput({ output_parsed: ANALYSIS })).toEqual(
      ANALYSIS,
    );
  });

  it("parses output_text JSON", () => {
    expect(
      extractAnalysisOutput({ output_text: JSON.stringify(ANALYSIS) }),
    ).toEqual(ANALYSIS);
  });

  it("parses Responses API output content", () => {
    const response = {
      id: "resp_1",
      output: [
        { type: "reasoning", summary: [] },
        {
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(ANALYSIS) }],
        },
      ],
    };
    expect(extractAnalysisOutput(response)).toEqual(ANALYSIS);
  });

  it("accepts a bare analysis object", () => {
    expect(extractAnalysisOutput(ANALYSIS)).toEqual(ANALYSIS);
  });

  it("returns null for unusable payloads", () => {
    expect(extractAnalysisOutput(null)).toBeNull();
    expect(extractAnalysisOutput("text")).toBeNull();
    expect(extractAnalysisOutput({ output_text: "not json" })).toBeNull();
    expect(
      extractAnalysisOutput({ output: [{ content: [{ text: "[1,2]" }] }] }),
    ).toBeNull();
    expect(extractAnalysisOutput({ error: "x" })).toBeNull();
  });
});
