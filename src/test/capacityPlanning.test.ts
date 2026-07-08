import { describe, expect, it } from "vitest";
import { calculateBusinessDayOverlapFactor, countWorkingDays, parseCapacityDate } from "@/utils/capacityPlanning";

function date(value: string) {
  return new Date(`${value}T00:00:00`);
}

describe("capacity planning business-day math", () => {
  it("parses ISO, pt-BR and legacy slash dates as local date-only values", () => {
    expect(parseCapacityDate("2026-06-01")?.getFullYear()).toBe(2026);
    expect(parseCapacityDate("2026-06-01")?.getMonth()).toBe(5);
    expect(parseCapacityDate("2026-06-01")?.getDate()).toBe(1);
    expect(parseCapacityDate("01/06/2026")?.getDate()).toBe(1);
    expect(parseCapacityDate("6/12/26")?.getMonth()).toBe(5);
    expect(parseCapacityDate("31/02/2026")).toBeNull();
  });

  it("counts only weekdays in inclusive date ranges", () => {
    expect(countWorkingDays(date("2026-06-01"), date("2026-06-07"))).toBe(5);
    expect(countWorkingDays(date("2026-06-06"), date("2026-06-07"))).toBe(0);
  });

  it("prorates overlap by business days instead of calendar days", () => {
    const factor = calculateBusinessDayOverlapFactor(date("2026-06-01"), date("2026-06-07"), {
      start: date("2026-06-04"),
      end: date("2026-06-07"),
    });

    expect(factor).toBe(2 / 5);
  });

  it("returns zero when a task only overlaps the period on weekends", () => {
    const factor = calculateBusinessDayOverlapFactor(date("2026-06-01"), date("2026-06-07"), {
      start: date("2026-06-06"),
      end: date("2026-06-07"),
    });

    expect(factor).toBe(0);
  });
});
