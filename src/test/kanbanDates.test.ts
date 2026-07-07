import { describe, expect, it } from "vitest";
import { formatKanbanFullDate, formatKanbanShortDate, parseKanbanDate } from "@/utils/kanbanDates";

describe("kanban dates", () => {
  it("parses legacy, ISO and pt-BR dates", () => {
    expect(parseKanbanDate("1/16/25")?.toISOString().slice(0, 10)).toBe("2025-01-16");
    expect(parseKanbanDate("2025-02-03")?.toISOString().slice(0, 10)).toBe("2025-02-03");
    expect(parseKanbanDate("03/02/2025")?.toISOString().slice(0, 10)).toBe("2025-02-03");
  });

  it("formats short and full labels for cards and modal details", () => {
    expect(formatKanbanShortDate("1/16/25")).toContain("16");
    expect(formatKanbanShortDate("1/16/25")).toMatch(/jan\.?/i);
    expect(formatKanbanFullDate("2025-02-03")).toBe("03 de fevereiro de 2025");
  });

  it("uses fallback labels for invalid values", () => {
    expect(parseKanbanDate("Em andamento")).toBeNull();
    expect(formatKanbanShortDate("Em andamento")).toBe("Sem prazo");
    expect(formatKanbanFullDate("31/02/2025")).toBe("Não informado");
  });
});
