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

  it("imports approved budget from project sheets with planned-cost fallback", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Projetos");
    sheet.addRow(["ID", "Projeto", "Valor Previsto", "Orçamento Aprovado", "Valor Gasto", "Status", "% Conclusão"]);
    sheet.addRow([1, "Projeto Financeiro", 1500, 2000, 300, "Em andamento", 25]);
    sheet.addRow([2, "Projeto Sem Orcamento", 800, "", 100, "Não iniciado", 0]);

    const result = await parseExcelFile(await workbookToFile(workbook, "projetos.xlsx"));

    expect(result.counts.projetos).toBe(2);
    expect(result.projetos?.[0]).toMatchObject({
      projeto: "Projeto Financeiro",
      valorPrevisto: 1500,
      orcamentoAprovado: 2000,
      valorGasto: 300,
    });
    expect(result.projetos?.[1]).toMatchObject({
      projeto: "Projeto Sem Orcamento",
      valorPrevisto: 800,
      orcamentoAprovado: 800,
    });
  });

  it("normalizes frozen schedule statuses", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Tarefas");
    sheet.addRow(["ID", "Projeto", "Tarefa", "Data Início Planejado", "Data Fim Planejado", "% Concluído", "Status"]);
    sheet.addRow(["1.1", "Projeto Congelado", "Aguardar cliente", "2026-06-01", "2026-06-03", 100, "Freezing"]);

    const result = await parseExcelFile(await workbookToFile(workbook, "cronograma-freeze.xlsx"));

    expect(result.tarefas?.[0]).toMatchObject({
      tarefa: "Aguardar cliente",
      percentual: 100,
      status: "Congelado",
    });
  });

  it("imports EdrawProj exports with schedule on Sheet1 and headers on row 2", async () => {
    const workbook = new ExcelJS.Workbook();
    const schedule = workbook.addWorksheet("Sheet1");
    schedule.addRow(["EdrawProj", "", "", "", "", "", "", "", "", ""]);
    schedule.addRow(["ID", "WBS", "Predecessors", "Task", "Start", "Finish", "Duration", "Status", "Progress", "Resources", "ActualStart", "ActualFinish"]);
    schedule.addRow([1, "1", "", "GESTÃO DE OBRAS - UPGRADE", "2026-04-29", "2026-06-12", "209Hour", "Delayed", "4.4%", "Flávio; Eduardo M.", "", ""]);
    schedule.addRow([2, "1.1", "", "1.1 -> Levantamento de Requisitos", "2026-04-29", "2026-04-30", "16Hour", "Completed", "100%", "Flávio", "2026-04-29", "2026-04-30"]);
    schedule.addRow([3, "1.2", "2FS", "MENU CONFIGURAÇÕES GERAIS", "2026-05-11", "2026-05-13", "23Hour", "Delayed", "0%", "Eduardo M.", "", ""]);

    const resources = workbook.addWorksheet("Sheet2");
    resources.addRow(["ID", "Name", "Max Units", "Type", "Standard Rate", "Overtime Rate", "Cost Per", "Group", "E-Mail", "Notes"]);
    resources.addRow([1, "Flávio", "100%", "People", "85Hour", "0Hour", 85, "FULL STACK", "", ""]);
    resources.addRow([2, "Eduardo M.", "100%", "People", "18.19Hour", "0Hour", 18.19, "BACK-END", "", ""]);

    const result = await parseExcelFile(await workbookToFile(workbook, "Gestão de Obras - Upgrade.xlsx"));

    expect(result.counts).toEqual({ projetos: 1, tarefas: 3, recursos: 2 });
    expect(result.projetos?.[0]).toMatchObject({
      projeto: "GESTÃO DE OBRAS - UPGRADE",
      totalTarefas: 3,
      tarefasConcluidas: 1,
      tarefasAtrasadas: 2,
    });
    expect(result.tarefas?.[1]).toMatchObject({
      id: "1.1",
      externalId: "2",
      parentId: "1",
      tarefa: "Levantamento de Requisitos",
      dataInicioPlanej: "4/29/26",
      dataFimPlanej: "4/30/26",
      esforcoPlanej: 16,
      percentual: 100,
      status: "Concluído",
    });
    expect(result.tarefas?.[2].predecessors?.[0]).toMatchObject({
      predecessorTaskId: "1.1",
      type: "FS",
    });
    expect(result.recursos?.map(resource => resource.nome)).toEqual(["Flávio", "Eduardo M."]);
  });
});
