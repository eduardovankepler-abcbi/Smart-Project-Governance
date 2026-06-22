import { describe, expect, it } from "vitest";
import type { Tarefa } from "@/data/projectData";
import {
  buildTaskExcelRows,
  buildTaskPdfRows,
  TASK_EXCEL_HEADERS,
  TASK_EXPORT_HEADERS,
  TASK_PDF_OPTIONS,
} from "@/utils/taskExport";

function task(partial: Partial<Tarefa> = {}): Tarefa {
  return {
    id: "10",
    parentId: "",
    projectId: 1,
    externalId: "100",
    wbs: "1.2.3",
    projeto: "Projeto Teste",
    tarefa: "Tarefa Teste",
    subtarefa: "",
    responsavel: "Maria",
    funcao: "PMO",
    dataInicioPlanej: "1/16/25",
    esforcoPlanej: 8,
    dataFimPlanej: "2025-02-03",
    dataInicioReal: "17/01/2025",
    esforcoReal: 2,
    dataFimReal: "",
    percentual: 25,
    status: "Em andamento",
    durationMinutes: 480,
    valorPrevisto: 100,
    valorGasto: 20,
    diasPlanejados: 1,
    diasReal: 0,
    diasCompletados: 0,
    ...partial,
  };
}

describe("task export", () => {
  it("keeps PDF and Excel headers aligned with exported rows", () => {
    const pdfRow = buildTaskPdfRows([task()])[0];
    const excelRow = buildTaskExcelRows([task()])[0];

    expect(pdfRow).toHaveLength(TASK_EXPORT_HEADERS.length);
    expect(excelRow).toHaveLength(TASK_EXCEL_HEADERS.length);
  });

  it("normalizes task dates in PDF rows", () => {
    const row = buildTaskPdfRows([task()])[0];

    expect(row[7]).toBe("16/01/2025");
    expect(row[8]).toBe("03/02/2025");
    expect(row[9]).toBe("17/01/2025");
    expect(row[10]).toBe("");
    expect(row[12]).toBe("25%");
  });

  it("keeps numeric values numeric in Excel rows while formatting dates", () => {
    const row = buildTaskExcelRows([task()])[0];

    expect(row[7]).toBe("16/01/2025");
    expect(row[8]).toBe("03/02/2025");
    expect(row[9]).toBe("17/01/2025");
    expect(row[10]).toBe("");
    expect(row[11]).toBe(8);
    expect(row[12]).toBe(25);
  });

  it("uses a wide PDF layout for task reports", () => {
    expect(TASK_PDF_OPTIONS.format).toBe("a3");
    expect(TASK_PDF_OPTIONS.fontSize).toBeLessThan(8);
    expect(TASK_PDF_OPTIONS.columnStyles?.[4]?.cellWidth).toBeGreaterThan(40);
    expect(TASK_PDF_OPTIONS.columnStyles?.[12]?.halign).toBe("right");
  });
});
