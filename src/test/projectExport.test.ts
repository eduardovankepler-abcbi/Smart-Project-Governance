import { describe, expect, it } from "vitest";
import type { Projeto } from "@/data/projectData";
import {
  buildProjectExcelRows,
  buildProjectPdfRows,
  PROJECT_EXCEL_HEADERS,
  PROJECT_EXPORT_HEADERS,
  PROJECT_PDF_OPTIONS,
} from "@/utils/projectExport";

function project(partial: Partial<Projeto> = {}): Projeto {
  return {
    id: 1,
    projectId: "PRJ-001",
    businessUnitName: "Corporativo",
    produtoName: "Portal",
    projeto: "Projeto Teste",
    descricao: "",
    prioridade: "2- Média",
    responsavel: "Maria",
    ftes: 2,
    valorPrevisto: 1000,
    orcamentoAprovado: 1200,
    valorGasto: 400,
    dataInicioPlanej: "1/16/25",
    dataFimPlanej: "2025-02-03",
    dataInicio: "",
    dataFimReal: "",
    totalTarefas: 10,
    tarefasConcluidas: 5,
    tarefasAndamento: 2,
    tarefasAtrasadas: 1,
    tarefasNaoIniciadas: 2,
    status: "Em andamento",
    conclusao: 50,
    ...partial,
  };
}

describe("project export", () => {
  it("keeps PDF and Excel headers aligned with exported rows", () => {
    const pdfRow = buildProjectPdfRows([project()])[0];
    const excelRow = buildProjectExcelRows([project()])[0];

    expect(pdfRow).toHaveLength(PROJECT_EXPORT_HEADERS.length);
    expect(excelRow).toHaveLength(PROJECT_EXCEL_HEADERS.length);
  });

  it("normalizes project dates in PDF rows", () => {
    const row = buildProjectPdfRows([project()])[0];

    expect(row[7]).toBe("16/01/2025");
    expect(row[8]).toBe("03/02/2025");
    expect(row[9]).toBe("50%");
    expect(row[16]).toBe("Saudável");
  });

  it("keeps numeric values numeric in Excel rows while formatting dates", () => {
    const row = buildProjectExcelRows([project()])[0];

    expect(row[7]).toBe("16/01/2025");
    expect(row[8]).toBe("03/02/2025");
    expect(row[9]).toBe(50);
    expect(row[10]).toBe(1000);
    expect(row[11]).toBe(1200);
    expect(row[12]).toBe(400);
    expect(row[16]).toBe("Saudável");
  });

  it("uses a wide PDF layout for project reports", () => {
    expect(PROJECT_PDF_OPTIONS.format).toBe("a3");
    expect(PROJECT_PDF_OPTIONS.fontSize).toBeLessThan(8);
    expect(PROJECT_PDF_OPTIONS.columnStyles?.[3]?.cellWidth).toBeGreaterThan(30);
    expect(PROJECT_PDF_OPTIONS.columnStyles?.[10]?.halign).toBe("right");
  });
});
