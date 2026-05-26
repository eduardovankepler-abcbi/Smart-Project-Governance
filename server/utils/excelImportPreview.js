const path = require("path");
const {
  sanitizeString,
  col,
  sheetToObjects,
  findSheetByColumns,
  cleanTaskName,
} = require("./parsing");

function createPreviewError(message, code, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

async function getCount(conn, sql, params = []) {
  const [[row]] = await conn.query(sql, params);
  return Number(row?.total || 0);
}

function getUploadedFileMetadata(file) {
  if (!file) return null;
  return {
    originalName: sanitizeString(file.originalname, 255),
    mimeType: sanitizeString(file.mimetype, 120),
    size: Number(file.size || 0),
  };
}

async function buildExcelImportPreview({
  workbook,
  file,
  conn,
  authUser,
  roles,
  maxRows,
  importConfirmPhrases,
  fullImportBackupConfirmation,
}) {
  const edrawScheduleSheet = findSheetByColumns(workbook, "ID", "WBS", "Task", "Start", "Finish");
  const projetoSheet = workbook.getWorksheet("Projeto") || workbook.getWorksheet("Projetos");
  const tarefaSheet = workbook.getWorksheet("Tarefa") || workbook.getWorksheet("Tarefas") || edrawScheduleSheet;
  const recursoSheet = workbook.getWorksheet("Recurso") || workbook.getWorksheet("Recursos") || findSheetByColumns(workbook, "Name", "Max Units", "Type");
  const edrawScheduleRows = edrawScheduleSheet ? sheetToObjects(edrawScheduleSheet) : [];
  const isScheduleImport = !projetoSheet && edrawScheduleRows.length > 0;
  const fileMetadata = getUploadedFileMetadata(file);

  if (!isScheduleImport && authUser?.role !== roles.ADMIN) {
    throw createPreviewError(
      "A importação Excel com substituição total é restrita a administradores",
      "AUTH_IMPORT_REPLACE_DENIED",
      403
    );
  }

  if (!isScheduleImport && !projetoSheet && !tarefaSheet && !recursoSheet) {
    throw createPreviewError(
      "Nenhuma aba reconhecida para importação foi encontrada",
      "IMPORT_PREVIEW_NO_RECOGNIZED_SHEETS",
      400
    );
  }

  if (isScheduleImport) {
    if (edrawScheduleRows.length > maxRows) {
      throw createPreviewError(`Limite de ${maxRows} linhas excedido na aba Tarefa`, "IMPORT_MAX_ROWS", 400);
    }

    const rootRow = edrawScheduleRows[0];
    const extPattern = new RegExp(`${path.extname(file.originalname || "").replace(".", "\\.")}$`, "i");
    const projectName = cleanTaskName(col(rootRow, "Task", "Tarefa")) || sanitizeString((file.originalname || "").replace(extPattern, ""), 200);
    const resourceNames = new Set();
    edrawScheduleRows.forEach((row) => {
      sanitizeString(col(row, "Resources", "Recursos", "Responsável", "Responsavel"), 500)
        .split(";")
        .map((item) => item.trim())
        .filter(Boolean)
        .forEach((item) => resourceNames.add(item));
    });
    const resourceNameList = Array.from(resourceNames);
    const [projectRows] = await conn.query("SELECT id FROM projetos WHERE projeto = ? LIMIT 1", [projectName]);
    const projectExists = projectRows.length > 0;
    const existingProjectId = projectRows[0]?.id || null;
    const existingProjectsTotal = await getCount(conn, "SELECT COUNT(*) AS total FROM projetos");
    const existingTasks = await getCount(conn, "SELECT COUNT(*) AS total FROM tarefas WHERE projeto_id = ? OR projeto = ?", [existingProjectId || 0, projectName]);
    const existingAssignments = await getCount(conn, "SELECT COUNT(*) AS total FROM task_assignments WHERE task_id IN (SELECT id FROM tarefas WHERE projeto_id = ? OR projeto = ?)", [existingProjectId || 0, projectName]);
    const existingDependencies = await getCount(
      conn,
      "SELECT COUNT(*) AS total FROM task_dependencies WHERE task_id IN (SELECT id FROM tarefas WHERE projeto_id = ? OR projeto = ?) OR predecessor_task_id IN (SELECT id FROM tarefas WHERE projeto_id = ? OR projeto = ?)",
      [existingProjectId || 0, projectName, existingProjectId || 0, projectName]
    );
    let existingResourceNames = [];
    if (resourceNameList.length) {
      const [rows] = await conn.query("SELECT nome FROM recursos WHERE nome IN (?)", [resourceNameList]);
      existingResourceNames = rows.map((row) => row.nome);
    }

    return {
      file: fileMetadata,
      importType: "schedule",
      importMode: "replace_project",
      projectName,
      projectId: existingProjectId,
      incoming: {
        projetos: 1,
        tarefas: edrawScheduleRows.length,
        recursos: resourceNameList.length,
      },
      existing: {
        projectExists,
        tarefas: existingTasks,
        dependencies: existingDependencies,
        assignments: existingAssignments,
        matchingResources: existingResourceNames.length,
        totalProjects: existingProjectsTotal,
      },
      impact: {
        projectsToCreate: projectExists ? 0 : 1,
        projectsToUpdate: projectExists ? 1 : 0,
        projectsToPreserve: projectExists ? Math.max(existingProjectsTotal - 1, 0) : existingProjectsTotal,
        tasksToReplace: existingTasks,
        dependenciesToReplace: existingDependencies,
        assignmentsToReplace: existingAssignments,
        resourcesToCreate: Math.max(resourceNameList.length - existingResourceNames.length, 0),
        resourcesToReuse: existingResourceNames.length,
        resourcesToDelete: 0,
      },
      requiredConfirmation: importConfirmPhrases.msProject,
    };
  }

  const projetoRows = projetoSheet ? sheetToObjects(projetoSheet) : [];
  const tarefaRows = tarefaSheet ? sheetToObjects(tarefaSheet) : [];
  const recursoRows = recursoSheet ? sheetToObjects(recursoSheet) : [];
  if (projetoRows.length > maxRows) throw createPreviewError(`Limite de ${maxRows} linhas excedido na aba Projeto`, "IMPORT_MAX_ROWS", 400);
  if (tarefaRows.length > maxRows) throw createPreviewError(`Limite de ${maxRows} linhas excedido na aba Tarefa`, "IMPORT_MAX_ROWS", 400);
  if (recursoRows.length > maxRows) throw createPreviewError(`Limite de ${maxRows} linhas excedido na aba Recurso`, "IMPORT_MAX_ROWS", 400);

  const existing = {
    projetos: await getCount(conn, "SELECT COUNT(*) AS total FROM projetos"),
    tarefas: await getCount(conn, "SELECT COUNT(*) AS total FROM tarefas"),
    dependencies: await getCount(conn, "SELECT COUNT(*) AS total FROM task_dependencies"),
    assignments: await getCount(conn, "SELECT COUNT(*) AS total FROM task_assignments"),
    recursos: await getCount(conn, "SELECT COUNT(*) AS total FROM recursos"),
  };

  return {
    file: fileMetadata,
    importType: "admin_full",
    importMode: "replace_all",
    incoming: {
      projetos: projetoRows.length,
      tarefas: tarefaRows.length,
      recursos: recursoRows.length,
    },
    existing,
    impact: {
      projectsToDelete: projetoSheet ? existing.projetos : 0,
      tasksToDelete: tarefaSheet ? existing.tarefas : 0,
      dependenciesToDelete: tarefaSheet ? existing.dependencies : 0,
      assignmentsToDelete: tarefaSheet ? existing.assignments : 0,
      resourcesToDelete: recursoSheet ? existing.recursos : 0,
      projectsToCreate: projetoRows.length,
      tasksToCreate: tarefaRows.length,
      resourcesToCreate: recursoRows.length,
      projectsToPreserve: projetoSheet ? 0 : existing.projetos,
      resourcesToPreserve: recursoSheet ? 0 : existing.recursos,
    },
    requiredConfirmation: importConfirmPhrases.excel,
    requiredBackupConfirmation: fullImportBackupConfirmation,
  };
}

module.exports = { buildExcelImportPreview };
