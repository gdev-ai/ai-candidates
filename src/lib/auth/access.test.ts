import { describe, expect, it } from "vitest";

import { isActive, type Member } from "@/lib/auth/access";

function member(status: Member["status"]): Member {
  return { user_id: "u1", email: "a@b.c", full_name: null, role: "hr_user", team_id: null, status };
}

describe("isActive", () => {
  it("only lets active members in", () => {
    expect(isActive(member("active"))).toBe(true);
    expect(isActive(member("pending"))).toBe(false);
    expect(isActive(member("disabled"))).toBe(false);
    expect(isActive(null)).toBe(false);
  });
});
