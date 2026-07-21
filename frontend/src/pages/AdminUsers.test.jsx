import { describe, expect, it } from "vitest";
import { FALLBACK_BRANCHES } from "../constants/branches";

describe("AdminUsers branch fallback", () => {
  it("uses the official branch IDs and leaves ID 4 unused", () => {
    expect(FALLBACK_BRANCHES).toEqual([
      { id: 1, name: "Dimebras PR" },
      { id: 2, name: "Alfamed MS" },
      { id: 3, name: "Dimebras MT" },
      { id: 5, name: "Dimebras MS" },
      { id: 6, name: "Dimebras SC" },
    ]);
    expect(FALLBACK_BRANCHES.some((branch) => branch.id === 4)).toBe(false);
  });
});
