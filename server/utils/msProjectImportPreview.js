const { sanitizeString } = require("./parsing");

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

async function buildMsProjectImportPreview({
  parsed,
  file,
  conn,
  importConfirmPhrases,
}) {
  const projectName = sanitizeString(parsed.projectName, 200);
  const resourceNames = Array.from(new Set((parsed.resources || []).map((resource) => resource.nome).filter(Boolean)));
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
  if (resourceNames.length) {
    const [rows] = await conn.query("SELECT nome FROM recursos WHERE nome IN (?)", [resourceNames]);
    existingResourceNames = rows.map((row) => row.nome);
  }

  return {
    file: getUploadedFileMetadata(file),
    importType: "ms_project_xml",
    importMode: "replace_project",
    projectName,
    projectId: existingProjectId,
    incoming: {
      projetos: 1,
      tarefas: parsed.tasks.length,
      recursos: resourceNames.length,
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
      resourcesToCreate: Math.max(resourceNames.length - existingResourceNames.length, 0),
      resourcesToReuse: existingResourceNames.length,
      resourcesToDelete: 0,
    },
    requiredConfirmation: importConfirmPhrases.msProject,
  };
}

module.exports = { buildMsProjectImportPreview };
