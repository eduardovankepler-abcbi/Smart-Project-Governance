const test = require("node:test");
const assert = require("node:assert/strict");
const ExcelJS = require("exceljs");
const { buildExcelImportPreview } = require("../utils/excelImportPreview");

const ROLES = { ADMIN: "admin", PMO: "pmo" };
const IMPORT_CONFIRM_PHRASES = {
  excel: "SUBSTITUIR TUDO",
  msProject: "SUBSTITUIR CRONOGRAMA",
};
const FULL_IMPORT_BACKUP_CONFIRMATION = "CONFIRMO BACKUP";

function createConn(handler) {
  return {
    async query(sql, params = []) {
      return handler(sql, params);
    },
  };
}

function createFile(originalname = "cronograma.xlsx") {
  return {
    originalname,
    mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 1234,
  };
}

function createBaseOptions(overrides = {}) {
  return {
    file: createFile(),
    authUser: { id: 1, role: ROLES.ADMIN },
    roles: ROLES,
    maxRows: 5000,
    importConfirmPhrases: IMPORT_CONFIRM_PHRASES,
    fullImportBackupConfirmation: FULL_IMPORT_BACKUP_CONFIRMATION,
    ...overrides,
  };
}

function buildScheduleWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(["ID", "WBS", "Predecessors", "Task", "Start", "Finish", "Duration", "Status", "Progress", "Resources"]);
  sheet.addRow([1, "1", "", "PROJETO ALFA", "2026-04-29", "2026-06-12", "80Hour", "Delayed", "20%", "Flávio; Eduardo"]);
  sheet.addRow([2, "1.1", "", "1.1 -> Kickoff", "2026-04-29", "2026-04-30", "8Hour", "Completed", "100%", "Flávio"]);
  return workbook;
}

function buildAdminWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const projetos = workbook.addWorksheet("Projeto");
  projetos.addRow(["ID", "Projeto", "Descrição"]);
  projetos.addRow([1, "Projeto Legado", "Importado"]);

  const tarefas = workbook.addWorksheet("Tarefa");
  tarefas.addRow(["ID", "Projeto", "Tarefa"]);
  tarefas.addRow(["1.1", "Projeto Legado", "Kickoff"]);
  tarefas.addRow(["1.2", "Projeto Legado", "Build"]);

  const recursos = workbook.addWorksheet("Recurso");
  recursos.addRow(["ID", "Nome"]);
  recursos.addRow([1, "Maria"]);
  return workbook;
}

test("Excel preview scopes schedule XLSX replacement to one project", async () => {
  const conn = createConn(async (sql, params) => {
    if (sql.includes("SELECT id FROM projetos WHERE projeto = ?")) {
      assert.deepEqual(params, ["PROJETO ALFA"]);
      return [[{ id: 42 }]];
    }
    if (sql === "SELECT COUNT(*) AS total FROM projetos") return [[{ total: 3 }]];
    if (sql.includes("FROM task_assignments")) return [[{ total: 5 }]];
    if (sql.includes("FROM task_dependencies")) return [[{ total: 4 }]];
    if (sql.includes("FROM tarefas WHERE projeto_id = ? OR projeto = ?")) {
      assert.deepEqual(params, [42, "PROJETO ALFA"]);
      return [[{ total: 12 }]];
    }
    if (sql.includes("SELECT nome FROM recursos WHERE nome IN")) {
      assert.deepEqual(params, [["Flávio", "Eduardo"]]);
      return [[{ nome: "Flávio" }]];
    }
    if (sql.includes("FROM project_baselines")) {
      assert.deepEqual(params, [42]);
      return [[{
        id: 8,
        baseline_number: 2,
        baseline_name: "LB 02 - Aprovada",
        task_count: 1,
        total_planned_effort: 40,
        total_planned_cost: 1000,
      }]];
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const preview = await buildExcelImportPreview(createBaseOptions({
    workbook: buildScheduleWorkbook(),
    conn,
  }));

  assert.equal(preview.importType, "schedule");
  assert.equal(preview.importMode, "replace_project");
  assert.equal(preview.projectName, "PROJETO ALFA");
  assert.deepEqual(preview.incoming, { projetos: 1, tarefas: 2, recursos: 2 });
  assert.equal(preview.impact.projectsToUpdate, 1);
  assert.equal(preview.impact.projectsToPreserve, 2);
  assert.equal(preview.impact.tasksToReplace, 12);
  assert.equal(preview.impact.dependenciesToReplace, 4);
  assert.equal(preview.impact.assignmentsToReplace, 5);
  assert.equal(preview.impact.resourcesToReuse, 1);
  assert.equal(preview.impact.resourcesToCreate, 1);
  assert.equal(preview.baselineImpact.hasOfficialBaseline, true);
  assert.equal(preview.baselineImpact.baselineId, 8);
  assert.equal(preview.baselineImpact.incomingTaskCount, 2);
  assert.equal(preview.baselineImpact.taskCountDelta, 1);
  assert.equal(preview.baselineImpact.incomingPlannedEffort, 88);
  assert.equal(preview.baselineImpact.plannedEffortDelta, 48);
  assert.equal(preview.baselineImpact.plannedCostDelta, -1000);
  assert.equal(preview.requiredConfirmation, "SUBSTITUIR CRONOGRAMA");
});

test("Excel preview summarizes destructive admin full import impact", async () => {
  const counts = {
    projetos: 10,
    tarefas: 80,
    task_dependencies: 30,
    task_assignments: 25,
    recursos: 12,
  };
  const conn = createConn(async (sql) => {
    if (sql.includes("FROM projetos")) return [[{ total: counts.projetos }]];
    if (sql.includes("FROM tarefas")) return [[{ total: counts.tarefas }]];
    if (sql.includes("FROM task_dependencies")) return [[{ total: counts.task_dependencies }]];
    if (sql.includes("FROM task_assignments")) return [[{ total: counts.task_assignments }]];
    if (sql.includes("FROM recursos")) return [[{ total: counts.recursos }]];
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  const preview = await buildExcelImportPreview(createBaseOptions({
    workbook: buildAdminWorkbook(),
    conn,
    file: createFile("legado.xlsx"),
  }));

  assert.equal(preview.importType, "admin_full");
  assert.equal(preview.importMode, "replace_all");
  assert.deepEqual(preview.incoming, { projetos: 1, tarefas: 2, recursos: 1 });
  assert.equal(preview.impact.projectsToDelete, 10);
  assert.equal(preview.impact.tasksToDelete, 80);
  assert.equal(preview.impact.dependenciesToDelete, 30);
  assert.equal(preview.impact.assignmentsToDelete, 25);
  assert.equal(preview.impact.resourcesToDelete, 12);
  assert.equal(preview.requiredConfirmation, "SUBSTITUIR TUDO");
  assert.equal(preview.requiredBackupConfirmation, "CONFIRMO BACKUP");
});

test("Excel preview denies full import for PMO users", async () => {
  const conn = createConn(async () => {
    throw new Error("database should not be queried when PMO full import is denied");
  });

  await assert.rejects(
    () => buildExcelImportPreview(createBaseOptions({
      workbook: buildAdminWorkbook(),
      conn,
      authUser: { id: 2, role: ROLES.PMO },
    })),
    (error) => {
      assert.equal(error.code, "AUTH_IMPORT_REPLACE_DENIED");
      assert.equal(error.status, 403);
      return true;
    }
  );
});
