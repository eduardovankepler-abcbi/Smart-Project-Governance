import { describe, expect, it } from "vitest";
import { formatDateForDisplay, formatDateForExport, formatDateForInput, parseFlexibleDate } from "@/utils/dateUtils";

describe("date utils", () => {
  it("parses ISO, pt-BR and legacy slash dates", () => {
    expect(parseFlexibleDate("2026-06-22")?.toISOString().slice(0, 10)).toBe("2026-06-22");
    expect(parseFlexibleDate("22/06/2026")?.toISOString().slice(0, 10)).toBe("2026-06-22");
    expect(parseFlexibleDate("1/16/25")?.toISOString().slice(0, 10)).toBe("2025-01-16");
  });

  it("rejects impossible and unknown date values", () => {
    expect(parseFlexibleDate("31/02/2026")).toBeNull();
    expect(parseFlexibleDate("2026-02-31")).toBeNull();
    expect(parseFlexibleDate("not a date")).toBeNull();
  });

  it("formats dates for inputs and exports consistently", () => {
    expect(formatDateForInput("22/06/2026")).toBe("2026-06-22");
    expect(formatDateForDisplay("2026-06-22")).toBe("22/06/2026");
    expect(formatDateForExport("1/16/25")).toBe("16/01/2025");
  });
});
