const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const {
  col,
  cleanTaskName,
  findSheetByColumns,
  mapScheduleStatus,
  outlineLevelFromWbs,
  parentFromWbs,
  parseExcelDate,
  parseDurationHours,
  sanitizeNumber,
  sheetToObjects,
} = require("../utils/parsing");

test("sheetToObjects detects shifted Excel headers and unwraps cell values", () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Tarefas");

  sheet.addRow(["Relatorio exportado"]);
  sheet.addRow([]);
  sheet.addRow([
    "ID",
    "Projeto",
    "Tarefa",
    "Responsável",
    "Data Início Planejado",
    "Esforço Planejado",
    "% Concluído",
  ]);

  const row = sheet.addRow([
    "1.1",
    "Projeto A",
    "Kickoff",
    "",
    new Date(2026, 0, 10),
    "1,5",
    { formula: "25+25", result: 50 },
  ]);
  row.getCell(4).value = { richText: [{ text: "Maria" }] };

  const rows = sheetToObjects(sheet);

  assert.equal(rows.length, 1);
  assert.equal(col(rows[0], "responsavel", "Responsável"), "Maria");
  assert.equal(parseExcelDate(col(rows[0], "Data Início Planejado")), "1/10/26");
  assert.equal(sanitizeNumber(col(rows[0], "Esforço Planejado")), 1.5);
  assert.equal(sanitizeNumber(col(rows[0], "% Concluído", "percentual")), 50);
});

test("EdrawProj schedule sheets are detected and normalized", () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");

  sheet.addRow(["EdrawProj"]);
  sheet.addRow(["ID", "WBS", "Predecessors", "Task", "Start", "Finish", "Duration", "Status", "Progress", "Resources"]);
  sheet.addRow([1, "1", "", "GESTÃO DE OBRAS - UPGRADE", "2026-04-29", "2026-06-12", "209Hour", "Delayed", "4.4%", "Flávio"]);
  sheet.addRow([2, "1.1", "", "1.1 -> Levantamento de Requisitos", "2026-04-29", "2026-04-30", "16Hour", "Completed", "100%", "Flávio"]);

  const found = findSheetByColumns(workbook, "ID", "WBS", "Task", "Start", "Finish");
  const rows = sheetToObjects(found);

  assert.equal(found.name, "Sheet1");
  assert.equal(rows.length, 2);
  assert.equal(cleanTaskName(col(rows[1], "Task")), "Levantamento de Requisitos");
  assert.equal(parentFromWbs(col(rows[1], "WBS")), "1");
  assert.equal(outlineLevelFromWbs(col(rows[1], "WBS")), 2);
  assert.equal(parseExcelDate(col(rows[1], "Start")), "4/29/26");
  assert.equal(parseDurationHours(col(rows[1], "Duration")), 16);
  assert.equal(mapScheduleStatus(col(rows[1], "Status"), sanitizeNumber(col(rows[1], "Progress"))), "Concluído");
});

test("mapScheduleStatus preserves frozen schedule status", () => {
  assert.equal(mapScheduleStatus("Freezing", 100), "Congelado");
  assert.equal(mapScheduleStatus("Congelado", 0), "Congelado");
});
