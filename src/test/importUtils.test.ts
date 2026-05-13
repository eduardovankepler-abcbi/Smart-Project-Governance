import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseExcelFile } from "@/utils/importUtils";

async function workbookToFile(workbook: ExcelJS.Workbook, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], filename, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("parseExcelFile", () => {
  it("imports xlsx sheets with metadata rows, dates and comma decimals", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Tarefas");

    sheet.addRow(["Relatorio exportado"]);
    sheet.addRow([]);
    sheet.addRow([
      "ID",
      "Parent ID",
      "Projeto",
      "Tarefa",
      "Responsável",
      "Data Início Planejado",
      "Esforço Planejado",
      "Data Fim Planejado",
      "% Concluído",
      "Status",
    ]);
    sheet.addRow([
      "1.1",
      "",
      "Projeto A",
      "Kickoff",
      "Maria",
      new Date(2026, 0, 10),
      "1,5",
      new Date(2026, 0, 12),
      50,
      "Em andamento",
    ]);

    const result = await parseExcelFile(await workbookToFile(workbook, "cronograma.xlsx"));

    expect(result.counts.tarefas).toBe(1);
    expect(result.tarefas?.[0]).toMatchObject({
      id: "1.1",
      parentId: "",
      projeto: "Projeto A",
      tarefa: "Kickoff",
      responsavel: "Maria",
      dataInicioPlanej: "1/10/26",
      esforcoPlanej: 1.5,
      dataFimPlanej: "1/12/26",
      percentual: 50,
      status: "Em andamento",
    });
  });
});
