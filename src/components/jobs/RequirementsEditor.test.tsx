// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RequirementsEditor, replaceKind } from "./RequirementsEditor";
import type { RequirementsDraft } from "@/types/job";

function makeDraft(overrides: Partial<RequirementsDraft> = {}): RequirementsDraft {
  return {
    seniority: "mid",
    city: "Cairo",
    min_experience: 3,
    max_experience: null,
    requirements: [
      { kind: "skill_required", text: "React" },
      { kind: "education", text: "BSc Computer Science" },
      { kind: "skill_required", text: "TypeScript" },
    ],
    ...overrides,
  };
}

/** Owns the state like the New Job page does, so controlled inputs update. */
function StatefulHarness({
  initial,
  onChangeSpy,
}: {
  initial: RequirementsDraft;
  onChangeSpy: (updated: RequirementsDraft) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <RequirementsEditor
      value={value}
      onChange={(updated) => {
        setValue(updated);
        onChangeSpy(updated);
      }}
    />
  );
}

function lastDraft(spy: ReturnType<typeof vi.fn>): RequirementsDraft {
  return spy.mock.calls.at(-1)?.[0] as RequirementsDraft;
}

describe("RequirementsEditor", () => {
  it("edits a requirement row in place, keeping other kinds", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<StatefulHarness initial={makeDraft()} onChangeSpy={spy} />);

    const first = screen.getByTestId("requirements-skill_required-item-0");
    await user.clear(first);
    await user.type(first, "Vue");

    const reqs = lastDraft(spy).requirements;
    expect(reqs.filter((r) => r.kind === "skill_required").map((r) => r.text)).toEqual(["Vue", "TypeScript"]);
    expect(reqs).toContainEqual({ kind: "education", text: "BSc Computer Science" });
  });

  it("removes and adds rows of a kind", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<StatefulHarness initial={makeDraft()} onChangeSpy={spy} />);

    await user.click(screen.getByRole("button", { name: "Remove React" }));
    await user.type(screen.getByTestId("requirements-skill_required-add-input"), "Next.js");
    await user.click(screen.getByTestId("requirements-skill_required-add-button"));

    expect(
      lastDraft(spy)
        .requirements.filter((r) => r.kind === "skill_required")
        .map((r) => r.text),
    ).toEqual(["TypeScript", "Next.js"]);
  });

  it("does not add an empty row", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<StatefulHarness initial={makeDraft()} onChangeSpy={spy} />);

    await user.click(screen.getByTestId("requirements-skill_required-add-button"));
    expect(spy).not.toHaveBeenCalled();
  });

  it("shows other kinds on their tab", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<StatefulHarness initial={makeDraft()} onChangeSpy={spy} />);

    await user.click(screen.getByRole("button", { name: /Education & Qualifications/ }));
    expect(screen.getByTestId("requirements-education-item-0")).toHaveProperty("value", "BSc Computer Science");
  });

  it("edits the experience range and flags min > max", async () => {
    const user = userEvent.setup();
    const spy = vi.fn();
    render(<StatefulHarness initial={makeDraft()} onChangeSpy={spy} />);

    await user.type(screen.getByLabelText("Max Experience (Years)"), "2");
    expect(lastDraft(spy).max_experience).toBe(2);
    expect(screen.getByRole("alert").textContent).toContain("Minimum experience");

    await user.clear(screen.getByLabelText("Min Experience (Years)"));
    expect(lastDraft(spy).min_experience).toBeNull();
  });
});

describe("replaceKind", () => {
  it("replaces only the given kind", () => {
    expect(
      replaceKind(
        [
          { kind: "keyword", text: "a" },
          { kind: "language", text: "Arabic" },
        ],
        "keyword",
        ["b", "c"],
      ),
    ).toEqual([
      { kind: "language", text: "Arabic" },
      { kind: "keyword", text: "b" },
      { kind: "keyword", text: "c" },
    ]);
  });
});
