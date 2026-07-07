import { describe, expect, it } from "vitest";
import { daysBetween, parseGanttDate } from "@/utils/ganttDates";

describe("gantt dates", () => {
  it("parses legacy, ISO and pt-BR dates for timeline positioning", () => {
    expect(parseGanttDate("1/16/25")?.toISOString().slice(0, 10)).toBe("2025-01-16");
    expect(parseGanttDate("2025-02-03")?.toISOString().slice(0, 10)).toBe("2025-02-03");
    expect(parseGanttDate("03/02/2025")?.toISOString().slice(0, 10)).toBe("2025-02-03");
  });

  it("rejects invalid dates instead of positioning them on the chart", () => {
    expect(parseGanttDate("31/02/2025")).toBeNull();
    expect(parseGanttDate("Em andamento")).toBeNull();
  });

  it("calculates timeline offsets in days", () => {
    const start = parseGanttDate("2025-02-03")!;
    const end = parseGanttDate("2025-02-10")!;

    expect(daysBetween(start, end)).toBe(7);
  });
});
