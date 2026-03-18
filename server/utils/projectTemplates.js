const { normalizeDateInput, sanitizeString, sanitizeInt } = require("./parsing");
const { buildNormalizedScheduleFromProjectSnapshot } = require("./scheduleNormalization");

const TEMPLATE_SOURCE_TYPES = {
  PROJECT_SNAPSHOT: "project_snapshot",
  MANUAL: "manual",
  XML_IMPORT: "xml_import",
};

function buildTemplateCode(templateName, index = 0) {
  const normalized = sanitizeString(templateName, 80)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = `TPL-${normalized || Date.now()}`;
  return index > 0 ? `${base}-${index + 1}` : base;
}

async function buildUniqueTemplateCode(pool, templateName) {
  const baseCode = buildTemplateCode(templateName);
  const [rows] = await pool.query("SELECT template_code FROM project_templates WHERE template_code LIKE ?", [`${baseCode}%`]);
  const existing = new Set(rows.map((row) => row.template_code));
  if (!existing.has(baseCode)) return baseCode;
  let index = 1;
  while (existing.has(buildTemplateCode(templateName, index))) {
    index += 1;
  }
  return buildTemplateCode(templateName, index);
}

function mapProjectTemplate(row) {
  return {
    id: row.id,
    templateCode: row.template_code,
    templateName: row.template_name,
    descricao: row.descricao || "",
    sourceType: row.source_type || TEMPLATE_SOURCE_TYPES.PROJECT_SNAPSHOT,
    sourceFormat: row.source_format || "internal_project",
    originProjectId: row.origin_project_id || undefined,
    originProjectName: row.origin_project_name || "",
    isActive: !!row.is_active,
    createdByUserId: row.created_by_user_id || undefined,
    createdByName: row.created_by_name || "",
    createdByRole: row.created_by_role || "",
    totalTasks: Number(row.total_tasks || 0),
    totalPlannedEffort: Number(row.total_planned_effort || 0),
    totalPlannedCost: Number(row.total_planned_cost || 0),
    createdAt: row.created_at || undefined,
    updatedAt: row.updated_at || undefined,
  };
}

async function loadProjectSnapshot(pool, projectId) {
  const [projectRows] = await pool.query("SELECT * FROM projetos WHERE id = ? LIMIT 1", [projectId]);
  if (!projectRows.length) {
    return null;
  }

  const [taskRows] = await pool.query(
    "SELECT * FROM tarefas WHERE projeto = ? ORDER BY sort_order, id",
    [projectRows[0].projeto]
  );
  const taskIds = taskRows.map((task) => task.id);
  const [assignmentRows] = taskIds.length
    ? await pool.query("SELECT * FROM task_assignments WHERE task_id IN (?) ORDER BY id", [taskIds])
    : [[]];
  const [dependencyRows] = taskIds.length
    ? await pool.query("SELECT * FROM task_dependencies WHERE task_id IN (?) ORDER BY id", [taskIds])
    : [[]];

  const assignmentsByTask = new Map();
  const dependenciesByTask = new Map();

  assignmentRows.forEach((row) => {
    const current = assignmentsByTask.get(row.task_id) || [];
    current.push({
      resourceId: row.resource_id || undefined,
      resourceName: row.resource_name || "",
      units: Number(row.units || 0),
      work: Number(row.work || 0),
      actualWork: Number(row.actual_work || 0),
      remainingWork: Number(row.remaining_work || 0),
      cost: Number(row.cost || 0),
    });
    assignmentsByTask.set(row.task_id, current);
  });

  dependencyRows.forEach((row) => {
    const current = dependenciesByTask.get(row.task_id) || [];
    current.push({
      predecessorTaskId: row.predecessor_task_id,
      type: row.dependency_type || "FS",
      lagMinutes: Number(row.lag_minutes || 0),
    });
    dependenciesByTask.set(row.task_id, current);
  });

  const tasks = taskRows.map((task) => ({
    ...task,
    assignments_json: JSON.stringify(assignmentsByTask.get(task.id) || []),
    predecessors_json: JSON.stringify(dependenciesByTask.get(task.id) || []),
    template_task_key: task.id,
    parent_template_task_key: task.parent_id || "",
  }));

  return { project: projectRows[0], tasks };
}

async function createTemplateFromProject(pool, payload) {
  const snapshot = await loadProjectSnapshot(pool, payload.projectId);
  if (!snapshot) {
    throw new Error("Projeto não encontrado");
  }

  const templateName = sanitizeString(payload.templateName, 180) || `${snapshot.project.projeto} - Template`;
  const templateCode = await buildUniqueTemplateCode(pool, templateName);
  const normalized = buildNormalizedScheduleFromProjectSnapshot(snapshot.project, snapshot.tasks);
  const totalPlannedEffort = normalized.tasks.reduce((sum, task) => sum + Number(task.esforcoPlanej || 0), 0);
  const totalPlannedCost = normalized.tasks.reduce((sum, task) => sum + Number(task.valorPrevisto || 0), 0);

  const [insert] = await pool.query(
    `INSERT INTO project_templates
      (template_code, template_name, descricao, source_type, source_format, origin_project_id, origin_project_name, created_by_user_id, created_by_name, created_by_role, total_tasks, total_planned_effort, total_planned_cost, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      templateCode,
      templateName,
      sanitizeString(payload.descricao, 500) || snapshot.project.descricao || "",
      payload.sourceType || TEMPLATE_SOURCE_TYPES.PROJECT_SNAPSHOT,
      payload.sourceFormat || normalized.sourceFormat || "internal_project",
      snapshot.project.id,
      snapshot.project.projeto,
      payload.actor?.id || null,
      payload.actor?.nome || "",
      payload.actor?.role || "",
      normalized.tasks.length,
      totalPlannedEffort,
      totalPlannedCost,
      JSON.stringify({
        projectCode: snapshot.project.project_code || "",
        projectType: snapshot.project.project_type || "Projeto",
        businessUnitId: snapshot.project.business_unit_id || null,
        businessUnitName: snapshot.project.business_unit_nome || "",
        produtoId: snapshot.project.produto_id || null,
        produtoName: snapshot.project.produto_nome || "",
      }),
    ]
  );

  for (const task of normalized.tasks) {
    await pool.query(
      `INSERT INTO project_template_tasks
        (template_id, template_task_key, parent_template_task_key, external_id, wbs, outline_level, sort_order, tarefa, subtarefa, responsavel, funcao, data_inicio_planej, data_inicio_planej_date, esforco_planej, data_fim_planej, data_fim_planej_date, data_inicio_real, data_inicio_real_date, esforco_real, data_fim_real, data_fim_real_date, percentual, status, task_type, is_milestone, duration_minutes, is_manual, constraint_type, constraint_date, constraint_date_date, notes, valor_previsto, valor_gasto, dias_planejados, dias_real, dias_completados, assignments_json, predecessors_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        insert.insertId,
        task.templateTaskKey,
        task.parentTemplateTaskKey,
        task.externalId,
        task.wbs,
        task.outlineLevel,
        task.sortOrder,
        task.tarefa,
        task.subtarefa,
        task.responsavel,
        task.funcao,
        task.dataInicioPlanej,
        task.dataInicioPlanejDate,
        task.esforcoPlanej,
        task.dataFimPlanej,
        task.dataFimPlanejDate,
        task.dataInicioReal,
        task.dataInicioRealDate,
        task.esforcoReal,
        task.dataFimReal,
        task.dataFimRealDate,
        task.percentual,
        task.status,
        task.taskType,
        task.milestone ? 1 : 0,
        task.durationMinutes,
        task.isManual ? 1 : 0,
        task.constraintType,
        task.constraintDate,
        task.constraintDateDate,
        task.notes,
        task.valorPrevisto,
        task.valorGasto,
        task.diasPlanejados,
        task.diasReal,
        task.diasCompletados,
        JSON.stringify(task.assignments || []),
        JSON.stringify(task.predecessors || []),
      ]
    );
  }

  const [rows] = await pool.query("SELECT * FROM project_templates WHERE id = ?", [insert.insertId]);
  return mapProjectTemplate(rows[0]);
}

async function listProjectTemplates(pool) {
  const [rows] = await pool.query(
    "SELECT * FROM project_templates WHERE is_active = 1 ORDER BY updated_at DESC, id DESC"
  );
  return rows.map(mapProjectTemplate);
}

async function getTemplateWithTasks(pool, templateId) {
  const [templateRows] = await pool.query("SELECT * FROM project_templates WHERE id = ? LIMIT 1", [templateId]);
  if (!templateRows.length) return null;
  const [taskRows] = await pool.query(
    "SELECT * FROM project_template_tasks WHERE template_id = ? ORDER BY sort_order, id",
    [templateId]
  );
  return { template: templateRows[0], tasks: taskRows };
}

async function instantiateProjectFromTemplate(pool, payload) {
  const templateBundle = await getTemplateWithTasks(pool, payload.templateId);
  if (!templateBundle) {
    throw new Error("Template não encontrado");
  }

  const metadata = (() => {
    try {
      return JSON.parse(templateBundle.template.metadata_json || "{}");
    } catch {
      return {};
    }
  })();

  const projectName = sanitizeString(payload.projeto, 180);
  if (!projectName) {
    throw new Error("Nome do projeto é obrigatório");
  }

  const projectCode = sanitizeString(payload.projectId, 50).toUpperCase()
    || `PRJ-${projectName.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || Date.now()}`;

  const businessUnitId = sanitizeInt(payload.businessUnitId) || sanitizeInt(metadata.businessUnitId) || 1;
  const produtoId = sanitizeInt(payload.produtoId) || sanitizeInt(metadata.produtoId) || null;
  const [businessUnitRows] = await pool.query("SELECT id, nome FROM business_units WHERE id = ? LIMIT 1", [businessUnitId]);
  if (!businessUnitRows.length) throw new Error("Business Unit inválida");

  let produtoNome = "";
  if (produtoId) {
    const [produtoRows] = await pool.query("SELECT id, nome, business_unit_id FROM produtos WHERE id = ? LIMIT 1", [produtoId]);
    if (!produtoRows.length) throw new Error("Produto inválido");
    if (Number(produtoRows[0].business_unit_id) !== Number(businessUnitId)) {
      throw new Error("O produto deve pertencer à mesma Business Unit do projeto");
    }
    produtoNome = produtoRows[0].nome;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [projectInsert] = await conn.query(
      `INSERT INTO projetos
        (project_code, project_type, business_unit_id, business_unit_nome, produto_id, produto_nome, projeto, descricao, prioridade, responsavel, ftes, valor_previsto, valor_gasto, data_inicio_planej, data_inicio_planej_date, data_fim_planej, data_fim_planej_date, data_inicio, data_inicio_real_date, data_fim_real, data_fim_real_date, total_tarefas, tarefas_concluidas, tarefas_andamento, tarefas_atrasadas, tarefas_nao_iniciadas, status, conclusao)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        projectCode,
        sanitizeString(payload.projectType, 30) || metadata.projectType || "Projeto",
        businessUnitId,
        businessUnitRows[0].nome,
        produtoId,
        produtoNome,
        projectName,
        sanitizeString(payload.descricao, 500) || templateBundle.template.descricao || "",
        sanitizeString(payload.prioridade, 50) || "2- Média",
        sanitizeString(payload.responsavel, 120) || "",
        0,
        0,
        0,
        "",
        null,
        "",
        null,
        "",
        null,
        "",
        null,
        0,
        0,
        0,
        0,
        0,
        "Não iniciado",
        0,
      ]
    );

    const newProjectId = projectInsert.insertId;
    const taskIdByTemplateKey = new Map();

    for (const [index, task] of templateBundle.tasks.entries()) {
      const sequence = index + 1;
      const newTaskId = `${newProjectId}-${sequence}`;
      taskIdByTemplateKey.set(task.template_task_key, newTaskId);
    }

    for (const [index, task] of templateBundle.tasks.entries()) {
      const sequence = index + 1;
      const newTaskId = taskIdByTemplateKey.get(task.template_task_key);
      const parentId = task.parent_template_task_key ? taskIdByTemplateKey.get(task.parent_template_task_key) || null : null;
      const assignments = (() => {
        try {
          return JSON.parse(task.assignments_json || "[]");
        } catch {
          return [];
        }
      })();
      const predecessors = (() => {
        try {
          return JSON.parse(task.predecessors_json || "[]");
        } catch {
          return [];
        }
      })();

      await conn.query(
        `INSERT INTO tarefas
          (id, parent_id, external_id, wbs, outline_level, sort_order, projeto, tarefa, subtarefa, responsavel, funcao, data_inicio_planej, data_inicio_planej_date, esforco_planej, data_fim_planej, data_fim_planej_date, data_inicio_real, data_inicio_real_date, esforco_real, data_fim_real, data_fim_real_date, percentual, status, task_type, is_milestone, duration_minutes, is_manual, constraint_type, constraint_date, constraint_date_date, notes, valor_previsto, valor_gasto, dias_planejados, dias_real, dias_completados)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newTaskId,
          parentId,
          sanitizeString(task.external_id, 50) || String(sequence),
          sanitizeString(task.wbs, 50) || String(sequence),
          sanitizeInt(task.outline_level) || 1,
          sanitizeInt(task.sort_order) || sequence,
          projectName,
          sanitizeString(task.tarefa, 500),
          sanitizeString(task.subtarefa, 500),
          sanitizeString(task.responsavel, 255),
          sanitizeString(task.funcao, 100),
          sanitizeString(task.data_inicio_planej, 20),
          normalizeDateInput(task.data_inicio_planej_date || task.data_inicio_planej) || null,
          Number(task.esforco_planej || 0),
          sanitizeString(task.data_fim_planej, 20),
          normalizeDateInput(task.data_fim_planej_date || task.data_fim_planej) || null,
          "",
          null,
          0,
          "",
          null,
          0,
          "Não iniciado",
          sanitizeString(task.task_type, 30) || "fixed_units",
          task.is_milestone ? 1 : 0,
          sanitizeInt(task.duration_minutes) || 0,
          task.is_manual ? 1 : 0,
          sanitizeString(task.constraint_type, 50),
          sanitizeString(task.constraint_date, 20),
          normalizeDateInput(task.constraint_date_date || task.constraint_date) || null,
          sanitizeString(task.notes, 4000),
          Number(task.valor_previsto || 0),
          0,
          sanitizeInt(task.dias_planejados) || 0,
          0,
          0,
        ]
      );

      for (const assignment of assignments) {
        let resourceId = sanitizeInt(assignment.resourceId) || null;
        if (!resourceId && assignment.resourceName) {
          const [resourceRows] = await conn.query("SELECT id FROM recursos WHERE nome = ? LIMIT 1", [sanitizeString(assignment.resourceName, 100)]);
          resourceId = resourceRows[0]?.id || null;
        }
        await conn.query(
          `INSERT INTO task_assignments
            (task_id, resource_id, resource_name, units, work, actual_work, remaining_work, cost)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newTaskId,
            resourceId,
            sanitizeString(assignment.resourceName, 100),
            Number(assignment.units || 1),
            Number(assignment.work || 0),
            0,
            Number(assignment.work || assignment.remainingWork || 0),
            Number(assignment.cost || 0),
          ]
        );
      }

      for (const predecessor of predecessors) {
        const predecessorTaskId = predecessor.predecessorTaskId
          ? taskIdByTemplateKey.get(predecessor.predecessorTaskId) || null
          : null;
        if (!predecessorTaskId) continue;
        await conn.query(
          "INSERT INTO task_dependencies (task_id, predecessor_task_id, dependency_type, lag_minutes) VALUES (?, ?, ?, ?)",
          [
            newTaskId,
            predecessorTaskId,
            sanitizeString(predecessor.type, 10) || "FS",
            sanitizeInt(predecessor.lagMinutes) || 0,
          ]
        );
      }
    }

    await conn.commit();
    return {
      projectId: newProjectId,
      projectName,
      template: mapProjectTemplate(templateBundle.template),
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

module.exports = {
  TEMPLATE_SOURCE_TYPES,
  mapProjectTemplate,
  listProjectTemplates,
  createTemplateFromProject,
  instantiateProjectFromTemplate,
};
