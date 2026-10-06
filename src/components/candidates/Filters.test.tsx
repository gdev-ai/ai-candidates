// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  Filters,
  DEFAULT_CANDIDATE_FILTERS,
  buildFilterQueryString,
} from "./Filters";

describe("Filters", () => {
  it("does not call onChange while typing (only on Apply)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Filters value={DEFAULT_CANDIDATE_FILTERS} onChange={onChange} />);
    await user.type(screen.getByTestId("filter-name"), "Amina");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies multiple filters together (combined, not overriding each other)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Filters value={DEFAULT_CANDIDATE_FILTERS} onChange={onChange} />);
    await user.type(screen.getByTestId("filter-name"), "Amina");
    await user.type(screen.getByTestId("filter-location"), "Cairo");
    await user.click(screen.getByTestId("filter-apply"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Amina", location: "Cairo" }),
    );
  });

  it("changing sort direction applies immediately without needing Apply", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<Filters value={DEFAULT_CANDIDATE_FILTERS} onChange={onChange} />);
    expect(screen.getByTestId("filter-sort-desc").textContent).toContain(
      "Highest first",
    );
    await user.click(screen.getByTestId("filter-sort-asc"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ sortDir: "asc" }),
    );
  });

  it("clear resets all text filters but preserves the current sort", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <Filters
        value={{ ...DEFAULT_CANDIDATE_FILTERS, name: "Amina", sortDir: "asc" }}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByTestId("filter-clear"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "", sortDir: "asc" }),
    );
  });

  it("shows a version filter with the chosen version", () => {
    render(
      <Filters
        value={DEFAULT_CANDIDATE_FILTERS}
        onChange={vi.fn()}
        versions={[
          { id: "v1", version: 1, candidates: 77 },
          { id: "v2", version: 2, candidates: 54 },
        ]}
        versionId="v2"
        onVersionChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId("filter-version").textContent).toContain(
      "Version 2 · 54",
    );
  });
});

describe("buildFilterQueryString", () => {
  it("includes only set filters plus the sort", () => {
    const qs = buildFilterQueryString({
      ...DEFAULT_CANDIDATE_FILTERS,
      name: " Amina ",
      sortBy: "found_at",
      sortDir: "asc",
    });
    expect(Object.fromEntries(new URLSearchParams(qs))).toEqual({
      name: "Amina",
      sort_by: "found_at",
      sort_dir: "asc",
    });
  });
});
