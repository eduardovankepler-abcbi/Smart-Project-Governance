import { describe, expect, it } from "vitest";
import { calculateBusinessDayOverlapFactor, countWorkingDays } from "@/utils/capacityPlanning";

function date(value: string) {
  return new Date(`${value}T00:00:00`);
}

describe("capacity planning business-day math", () => {
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
