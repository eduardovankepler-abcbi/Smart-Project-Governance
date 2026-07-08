import { describe, expect, it } from "vitest";
import { formatHistoryDate, formatHistoryDateForInput, formatHistoryDateTime } from "@/utils/historyDates";

describe("history dates", () => {
  it("formats due dates for display", () => {
    expect(formatHistoryDate("2026-07-08")).toBe("08/07/2026");
    expect(formatHistoryDate("7/8/26")).toBe("08/07/2026");
    expect(formatHistoryDate("08/07/2026")).toBe("08/07/2026");
  });

  it("normalizes due dates for date inputs", () => {
    expect(formatHistoryDateForInput("7/8/26")).toBe("2026-07-08");
    expect(formatHistoryDateForInput("08/07/2026")).toBe("2026-07-08");
    expect(formatHistoryDateForInput("31/02/2026")).toBe("");
  });

  it("keeps fallback labels for empty and invalid timestamps", () => {
    expect(formatHistoryDate(undefined)).toBe("—");
    expect(formatHistoryDateTime(undefined)).toBe("—");
    expect(formatHistoryDateTime("not-a-date")).toBe("not-a-date");
  });

  it("formats audit timestamps in pt-BR", () => {
    expect(formatHistoryDateTime("2026-07-08T12:30:00Z")).toContain("08/07/2026");
  });
});
