import { describe, expect, it } from "vitest";
import { daysUntil, formatDashboardDate, getMonthBucket, parseDashboardDate } from "@/utils/dashboardDates";

describe("dashboard dates", () => {
  it("parses legacy, ISO and pt-BR dates", () => {
    expect(parseDashboardDate("1/16/25")?.toISOString().slice(0, 10)).toBe("2025-01-16");
    expect(parseDashboardDate("2025-02-03")?.toISOString().slice(0, 10)).toBe("2025-02-03");
    expect(parseDashboardDate("03/02/2025")?.toISOString().slice(0, 10)).toBe("2025-02-03");
  });

  it("formats action item and notification dates consistently", () => {
    expect(formatDashboardDate("2025-02-03")).toBe("03/02/2025");
    expect(formatDashboardDate("Em andamento", "N/A")).toBe("N/A");
  });

  it("builds stable month buckets for burndown data", () => {
    expect(getMonthBucket("1/16/25")).toEqual({ key: "1/25", month: 1, year: 25 });
    expect(getMonthBucket("2025-02-03")).toEqual({ key: "2/25", month: 2, year: 25 });
    expect(getMonthBucket("31/02/2025")).toBeNull();
  });

  it("calculates days until a due date using calendar days", () => {
    const now = new Date(2025, 0, 10, 15, 0, 0);

    expect(daysUntil("2025-01-10", now)).toBe(0);
    expect(daysUntil("2025-01-17", now)).toBe(7);
    expect(daysUntil("Em andamento", now)).toBeNull();
  });
});
