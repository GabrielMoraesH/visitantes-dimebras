import { describe, expect, it } from "vitest";
import { formatDatePtBr, formatTimePtBr } from "./dateTime";

describe("dateTime", () => {
  it("formats date and time in America/Sao_Paulo regardless of the environment default timezone", () => {
    const value = "2026-07-22T12:30:00.000Z";

    expect(formatDatePtBr(value)).toBe("22/07/2026");
    expect(formatTimePtBr(value)).toBe("09:30");
  });

  it("preserves fallback values for null or invalid dates", () => {
    expect(formatDatePtBr(null, "fallback")).toBe("fallback");
    expect(formatTimePtBr(undefined, "fallback")).toBe("fallback");
    expect(formatTimePtBr("invalid", "fallback")).toBe("fallback");
  });
});
